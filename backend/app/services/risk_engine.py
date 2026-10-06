"""KAIA Risk Engine — Clinical Decision Support (configurable rules + constrained model).

Design constraints:
- Produces screening *prioritization* only: routine_screening | follow_up_recommended | priority_follow_up.
- Rules are evaluated first and are fully configurable by KAIA system admins.
- The model component may escalate by one level but can never de-escalate a rule outcome.
- Every decision requires clinician review before release and carries a full, PII-free trace.
"""

import math
from dataclasses import asdict, dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AssayResult, FollowUp, ModelVersion, Referral, RiskRule, Screening
from app.models.enums import FollowUpEventType, ModelStatus, ModelType, ScreeningOutcome, ScreeningStatus

PATHWAY_KEY = "cervical_hpv_primary"
RULES_ENGINE_VERSION = "kaia-risk-rules-1.0"
DECISION_LABEL = "Clinical Decision Support — not an autonomous diagnosis"
MODEL_ESCALATION_THRESHOLD = 0.85

SEVERITY = {
    ScreeningOutcome.routine_screening: 0,
    ScreeningOutcome.follow_up_recommended: 1,
    ScreeningOutcome.priority_follow_up: 2,
}

SIGNAL_OPTIONS = ["detected", "not_detected", "indeterminate"]

RULE_FIELDS: dict[str, dict] = {
    "control_valid": {"label": "Control line valid", "type": "boolean"},
    "hpv_signal": {"label": "High-risk HPV signal", "type": "enum", "options": SIGNAL_OPTIONS},
    "hpv_genotype": {"label": "HPV genotype (if available)", "type": "enum", "options": ["hpv_16_18", "other_high_risk", "none"]},
    "secondary_marker": {"label": "Secondary biomarker", "type": "enum", "options": SIGNAL_OPTIONS},
    "sample_quality": {"label": "Sample quality", "type": "enum", "options": ["good", "acceptable", "poor"]},
    "hpv_signal_intensity": {"label": "HPV signal intensity (0–1)", "type": "number"},
    "prior_high_risk_result": {"label": "Follow-up result in previous 24 months", "type": "boolean"},
    "prior_missed_follow_up": {"label": "Previously missed follow-up", "type": "boolean"},
    "age_bracket": {"label": "Age bracket", "type": "enum", "options": ["under-25", "25-29", "30-39", "40-49", "50-65", "65+"]},
}

OPERATORS = {"eq": "equals", "ne": "does not equal", "in": "is one of", "gte": "at least", "lte": "at most"}

DEFAULT_RULES = [
    {
        "name": "HPV signal with secondary biomarker",
        "description": "High-risk HPV signal together with a secondary biomarker signal prioritizes clinical evaluation.",
        "priority": 10,
        "conditions": {"all": [
            {"field": "hpv_signal", "op": "eq", "value": "detected"},
            {"field": "secondary_marker", "op": "eq", "value": "detected"},
        ]},
        "outcome": ScreeningOutcome.priority_follow_up,
    },
    {
        "name": "HPV 16/18 genotype signal",
        "description": "Genotype channel indicates HPV 16/18, which pathways commonly prioritize for evaluation.",
        "priority": 20,
        "conditions": {"all": [
            {"field": "hpv_signal", "op": "eq", "value": "detected"},
            {"field": "hpv_genotype", "op": "eq", "value": "hpv_16_18"},
        ]},
        "outcome": ScreeningOutcome.priority_follow_up,
    },
    {
        "name": "Persistent HPV signal",
        "description": "HPV signal detected again within 24 months of a previous follow-up result.",
        "priority": 30,
        "conditions": {"all": [
            {"field": "hpv_signal", "op": "eq", "value": "detected"},
            {"field": "prior_high_risk_result", "op": "eq", "value": True},
        ]},
        "outcome": ScreeningOutcome.priority_follow_up,
    },
    {
        "name": "High-risk HPV signal",
        "description": "Any high-risk HPV signal requires confirmatory screening.",
        "priority": 40,
        "conditions": {"all": [{"field": "hpv_signal", "op": "eq", "value": "detected"}]},
        "outcome": ScreeningOutcome.follow_up_recommended,
    },
    {
        "name": "Indeterminate HPV signal",
        "description": "Borderline signal: recommend confirmatory screening rather than routine recall.",
        "priority": 50,
        "conditions": {"all": [{"field": "hpv_signal", "op": "eq", "value": "indeterminate"}]},
        "outcome": ScreeningOutcome.follow_up_recommended,
    },
    {
        "name": "No high-risk signal",
        "description": "Valid assay with no high-risk signal returns to routine screening.",
        "priority": 90,
        "conditions": {"all": [
            {"field": "control_valid", "op": "eq", "value": True},
            {"field": "hpv_signal", "op": "eq", "value": "not_detected"},
        ]},
        "outcome": ScreeningOutcome.routine_screening,
    },
]


@dataclass
class RiskInput:
    control_valid: bool
    hpv_signal: str
    hpv_genotype: str
    secondary_marker: str
    sample_quality: str
    hpv_signal_intensity: float
    prior_high_risk_result: bool
    prior_missed_follow_up: bool
    age_bracket: str
    pathway_key: str = PATHWAY_KEY


@dataclass
class RiskDecision:
    outcome: str
    trace: dict


def validate_conditions(conditions: dict) -> None:
    if not isinstance(conditions, dict) or set(conditions) != {"all"} or not isinstance(conditions["all"], list):
        raise ValueError('Conditions must be an object of the form {"all": [...]}')
    for cond in conditions["all"]:
        if not isinstance(cond, dict) or set(cond) != {"field", "op", "value"}:
            raise ValueError("Each condition needs exactly field, op and value")
        spec = RULE_FIELDS.get(cond["field"])
        if spec is None:
            raise ValueError(f"Unknown field '{cond['field']}'")
        if cond["op"] not in OPERATORS:
            raise ValueError(f"Unknown operator '{cond['op']}'")
        values = cond["value"] if cond["op"] == "in" else [cond["value"]]
        if cond["op"] == "in" and not isinstance(cond["value"], list):
            raise ValueError("Operator 'in' requires a list value")
        for v in values:
            if spec["type"] == "boolean" and not isinstance(v, bool):
                raise ValueError(f"{cond['field']} expects true/false")
            if spec["type"] == "enum" and v not in spec["options"]:
                raise ValueError(f"{cond['field']} expects one of {spec['options']}")
            if spec["type"] == "number" and (isinstance(v, bool) or not isinstance(v, int | float)):
                raise ValueError(f"{cond['field']} expects a number")
        if cond["op"] in ("gte", "lte") and spec["type"] != "number":
            raise ValueError(f"Operator '{cond['op']}' only applies to numeric fields")


def _condition_matches(cond: dict, inp: RiskInput) -> bool:
    actual = getattr(inp, cond["field"])
    op, expected = cond["op"], cond["value"]
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "in":
        return actual in expected
    if op == "gte":
        return actual >= expected
    if op == "lte":
        return actual <= expected
    return False


def rule_matches(conditions: dict, inp: RiskInput) -> bool:
    return all(_condition_matches(c, inp) for c in conditions.get("all", []))


def model_score(inp: RiskInput) -> float:
    """Simulated prioritization model (logistic). Replace with a trained, validated model."""
    z = -2.4
    if inp.hpv_signal == "detected":
        z += 1.2 + 1.6 * inp.hpv_signal_intensity
    if inp.hpv_genotype == "hpv_16_18":
        z += 1.1
    if inp.secondary_marker == "detected":
        z += 1.3
    if inp.prior_high_risk_result:
        z += 0.9
    if inp.prior_missed_follow_up:
        z += 0.4
    return round(1 / (1 + math.exp(-z)), 3)


def active_rules(db: Session, pathway_key: str = PATHWAY_KEY) -> list[RiskRule]:
    return list(
        db.scalars(
            select(RiskRule)
            .where(RiskRule.pathway_key == pathway_key, RiskRule.active.is_(True))
            .order_by(RiskRule.priority)
        )
    )


def active_model(db: Session, model_type: str) -> ModelVersion | None:
    return db.scalar(
        select(ModelVersion).where(ModelVersion.model_type == model_type, ModelVersion.status == ModelStatus.active)
    )


def evaluate(db: Session, inp: RiskInput) -> RiskDecision:
    rules = active_rules(db, inp.pathway_key)
    matched = [r for r in rules if rule_matches(r.conditions, inp)]
    if matched:
        top = max(matched, key=lambda r: (SEVERITY[r.outcome], -r.priority))
        rule_outcome = top.outcome
        rule_note = f"Most protective matching rule: “{top.name}”"
    else:
        rule_outcome = ScreeningOutcome.follow_up_recommended
        rule_note = "No rule matched — defaulting to follow-up so a clinician reviews the case"

    model = active_model(db, ModelType.risk)
    score = model_score(inp)
    escalated = False
    final = rule_outcome
    if model is not None and rule_outcome == ScreeningOutcome.follow_up_recommended and score >= MODEL_ESCALATION_THRESHOLD:
        final = ScreeningOutcome.priority_follow_up
        escalated = True

    trace = {
        "label": DECISION_LABEL,
        "engine_version": RULES_ENGINE_VERSION,
        "pathway_key": inp.pathway_key,
        "inputs": asdict(inp),
        "matched_rules": [
            {"id": str(r.id), "name": r.name, "priority": r.priority, "outcome": r.outcome} for r in matched
        ],
        "rules_evaluated": len(rules),
        "rule_outcome": rule_outcome,
        "rule_note": rule_note,
        "model": {
            "version": f"{model.name} {model.version}" if model else None,
            "score": score,
            "escalation_threshold": MODEL_ESCALATION_THRESHOLD,
            "escalated": escalated,
            "note": "Model may escalate follow-up to priority; it cannot lower a rule outcome.",
        },
        "final_outcome": final,
        "requires_clinician_review": True,
    }
    return RiskDecision(outcome=final, trace=trace)


def build_input(db: Session, screening: Screening, assay: AssayResult, hpv_intensity: float) -> RiskInput:
    window_start = (screening.registered_at - timedelta(days=730)) if screening.registered_at else None
    prior_query = select(Screening.id).where(
        Screening.patient_id == screening.patient_id,
        Screening.id != screening.id,
        Screening.status == ScreeningStatus.result_ready,
        Screening.outcome.in_([ScreeningOutcome.follow_up_recommended, ScreeningOutcome.priority_follow_up]),
    )
    if window_start is not None:
        prior_query = prior_query.where(Screening.released_at >= window_start)
    prior_high_risk = db.scalar(prior_query.limit(1)) is not None
    prior_missed = (
        db.scalar(
            select(FollowUp.id)
            .join(Referral, Referral.id == FollowUp.referral_id)
            .where(Referral.patient_id == screening.patient_id, FollowUp.event_type == FollowUpEventType.missed)
            .limit(1)
        )
        is not None
    )
    return RiskInput(
        control_valid=assay.control_valid,
        hpv_signal=assay.hpv_signal,
        hpv_genotype=assay.hpv_genotype or "none",
        secondary_marker=assay.secondary_marker,
        sample_quality=assay.sample_quality,
        hpv_signal_intensity=hpv_intensity,
        prior_high_risk_result=prior_high_risk,
        prior_missed_follow_up=prior_missed,
        age_bracket=screening.patient.age_bracket,
    )
