"""KAIA Continuity Engine — predicts risk of NOT completing required follow-up.

It never predicts disease. Output is shown to health workers and institution admins only,
to target outreach. The MVP uses a transparent simulated logistic model; a trained model can
implement `predict(features)` with the same output contract.
"""

import math
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CarePathway, FollowUp, Referral
from app.models.enums import FollowUpEventType, PathwayStatus, ReferralPriority, ReferralStatus, ScreeningOutcome

MODEL_VERSION = "kaia-continuity-sim 0.3.0"


@dataclass
class ContinuityFeatures:
    days_since_result: int
    days_since_referral: int | None
    referral_status: str | None
    unscheduled_days: int
    previous_missed_appointments: int
    distance_category: str
    facility_availability: str
    referral_priority: str
    previous_follow_up_completed: bool
    appointment_delay_days: int | None


@dataclass
class ContinuityPrediction:
    risk_level: str
    score: float
    reason: str
    recommended_intervention: str
    contributions: list[dict]
    features: dict
    model_version: str = MODEL_VERSION


def _days(since: datetime | None, today: date) -> int:
    if since is None:
        return 0
    return max(0, (today - since.date()).days)


def extract_features(db: Session, pathway: CarePathway, today: date | None = None) -> ContinuityFeatures:
    today = today or datetime.now(UTC).date()
    screening = pathway.screening
    referral = next((r for r in reversed(pathway.referrals) if r.status != ReferralStatus.cancelled), None)
    released = screening.released_at

    missed = db.scalar(
        select(func.count(FollowUp.id))
        .join(Referral, Referral.id == FollowUp.referral_id)
        .where(Referral.patient_id == pathway.patient_id, FollowUp.event_type == FollowUpEventType.missed)
    ) or 0
    prev_completed = (
        db.scalar(
            select(func.count(CarePathway.id)).where(
                CarePathway.patient_id == pathway.patient_id,
                CarePathway.id != pathway.id,
                CarePathway.status == PathwayStatus.completed,
                CarePathway.pathway_type != ScreeningOutcome.routine_screening,
            )
        )
        or 0
    ) > 0

    facility = referral.destination_org if referral else pathway.recommended_facility
    availability = "available" if facility and "same_week_appointments" in (facility.services or []) else "limited"

    delay = None
    unscheduled_since = released
    if referral is not None:
        unscheduled_since = referral.generated_at
        if referral.status in (ReferralStatus.scheduled, ReferralStatus.attended, ReferralStatus.completed):
            unscheduled_since = None
            if referral.appointments:
                delay = max(0, (referral.appointments[-1].scheduled_for.date() - referral.generated_at.date()).days)
        elif referral.status == ReferralStatus.missed:
            unscheduled_since = referral.status_changed_at

    return ContinuityFeatures(
        days_since_result=_days(released, today),
        days_since_referral=_days(referral.generated_at, today) if referral else None,
        referral_status=referral.status if referral else None,
        unscheduled_days=_days(unscheduled_since, today) if unscheduled_since else 0,
        previous_missed_appointments=int(missed),
        distance_category=screening.patient.distance_category,
        facility_availability=availability,
        referral_priority=(
            ReferralPriority.priority if pathway.pathway_type == ScreeningOutcome.priority_follow_up else ReferralPriority.standard
        ),
        previous_follow_up_completed=prev_completed,
        appointment_delay_days=delay,
    )


def predict(features: ContinuityFeatures) -> ContinuityPrediction:
    contributions: list[dict] = []

    def add(key: str, weight: float, reason: str, intervention: str) -> None:
        if weight != 0:
            contributions.append(
                {"factor": key, "weight": round(weight, 3), "reason": reason, "intervention": intervention}
            )

    z = -2.0
    if features.unscheduled_days:
        w = 0.12 * min(features.unscheduled_days, 40)
        label = "remained unscheduled" if features.referral_status != ReferralStatus.missed else "not been rescheduled"
        add("unscheduled_days", w, f"Follow-up has {label} for {features.unscheduled_days} days.",
            "Community health worker outreach")
    if features.previous_missed_appointments:
        n = features.previous_missed_appointments
        add("previous_missed_appointments", 1.1 * n, f"{n} previously missed appointment{'s' if n > 1 else ''}.",
            "Reminder call and reschedule; offer transport support")
    distance_weight = {"near": 0.0, "moderate": 0.45, "far": 1.0}.get(features.distance_category, 0.45)
    add("distance_category", distance_weight, f"Lives {features.distance_category} from the partner facility.",
        "Arrange transport support or refer to a nearer facility")
    if features.facility_availability == "limited":
        add("facility_availability", 0.5, "Destination facility has limited appointment availability.",
            "Refer to an alternate partner facility with earlier slots")
    if features.referral_priority == ReferralPriority.priority:
        add("referral_priority", 0.25, "Priority follow-up with a short recommended timeframe.",
            "Same-week scheduling with navigator support")
    if features.previous_follow_up_completed:
        add("previous_follow_up_completed", -0.7, "Completed a previous follow-up pathway.", "Standard SMS reminder")
    if features.appointment_delay_days and features.appointment_delay_days > 14:
        add("appointment_delay_days", 0.03 * (features.appointment_delay_days - 14),
            f"Appointment is scheduled {features.appointment_delay_days} days after referral.",
            "Request an earlier appointment slot")

    z += sum(c["weight"] for c in contributions)
    score = round(1 / (1 + math.exp(-z)), 3)
    level = "HIGH" if score >= 0.65 else "MEDIUM" if score >= 0.35 else "LOW"

    positive = sorted((c for c in contributions if c["weight"] > 0), key=lambda c: c["weight"], reverse=True)
    if positive and level != "LOW":
        reason, intervention = positive[0]["reason"], positive[0]["intervention"]
    elif positive:
        reason, intervention = positive[0]["reason"], "Standard SMS reminder"
    else:
        reason, intervention = "No continuity risk factors identified.", "Standard SMS reminder"

    return ContinuityPrediction(
        risk_level=level,
        score=score,
        reason=reason,
        recommended_intervention=intervention,
        contributions=sorted(contributions, key=lambda c: abs(c["weight"]), reverse=True),
        features=asdict(features),
    )


def assess(db: Session, pathway: CarePathway) -> ContinuityPrediction:
    return predict(extract_features(db, pathway))
