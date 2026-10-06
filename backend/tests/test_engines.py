import pytest

from app.db.session import SessionLocal
from app.services import continuity, risk_engine
from app.services.continuity import ContinuityFeatures
from app.services.risk_engine import RiskInput


def _input(**overrides) -> RiskInput:
    base = dict(control_valid=True, hpv_signal="not_detected", hpv_genotype="none", secondary_marker="not_detected",
                sample_quality="good", hpv_signal_intensity=0.05, prior_high_risk_result=False,
                prior_missed_follow_up=False, age_bracket="30-39")
    return RiskInput(**{**base, **overrides})


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, "routine_screening"),
        ({"hpv_signal": "detected", "hpv_genotype": "other_high_risk", "hpv_signal_intensity": 0.58}, "follow_up_recommended"),
        ({"hpv_signal": "detected", "hpv_genotype": "hpv_16_18", "hpv_signal_intensity": 0.7}, "priority_follow_up"),
        ({"hpv_signal": "detected", "secondary_marker": "detected", "hpv_signal_intensity": 0.7}, "priority_follow_up"),
        ({"hpv_signal": "detected", "prior_high_risk_result": True, "hpv_signal_intensity": 0.6}, "priority_follow_up"),
        ({"hpv_signal": "indeterminate", "hpv_signal_intensity": 0.2}, "follow_up_recommended"),
    ],
)
def test_risk_engine_outcomes(client, overrides, expected):
    with SessionLocal() as db:
        decision = risk_engine.evaluate(db, _input(**overrides))
    assert decision.outcome == expected
    assert decision.trace["requires_clinician_review"] is True
    assert "not an autonomous diagnosis" in decision.trace["label"]


def test_model_never_deescalates(client):
    with SessionLocal() as db:
        decision = risk_engine.evaluate(db, _input(hpv_signal="detected", secondary_marker="detected", hpv_signal_intensity=0.3))
    assert decision.outcome == "priority_follow_up"
    assert decision.trace["model"]["escalated"] is False


def test_rule_validation_rejects_unknown_fields():
    with pytest.raises(ValueError):
        risk_engine.validate_conditions({"all": [{"field": "cancer_probability", "op": "gte", "value": 0.5}]})
    with pytest.raises(ValueError):
        risk_engine.validate_conditions({"all": [{"field": "hpv_signal", "op": "eq", "value": "maybe"}]})
    risk_engine.validate_conditions({"all": [{"field": "hpv_signal", "op": "in", "value": ["detected", "indeterminate"]}]})


def test_admin_can_test_and_edit_rules(client, auth):
    admin = auth("sysadmin")
    rules = client.get("/api/admin/risk-rules", headers=admin).json()
    assert rules["label"].startswith("Clinical Decision Support")
    dry = client.post("/api/admin/risk-rules/test", headers=admin,
                      json={"hpv_signal": "detected", "hpv_genotype": "hpv_16_18", "hpv_signal_intensity": 0.7})
    assert dry.json()["outcome"] == "priority_follow_up"
    bad = client.post("/api/admin/risk-rules", headers=admin, json={
        "name": "Bad", "description": "x", "priority": 5, "outcome": "priority_follow_up",
        "conditions": {"all": [{"field": "nope", "op": "eq", "value": True}]}})
    assert bad.status_code == 422


def test_continuity_engine_flags_unscheduled_follow_up():
    features = ContinuityFeatures(days_since_result=24, days_since_referral=21, referral_status="created", unscheduled_days=21,
                                  previous_missed_appointments=0, distance_category="moderate", facility_availability="available",
                                  referral_priority="standard", previous_follow_up_completed=False, appointment_delay_days=None)
    prediction = continuity.predict(features)
    assert prediction.risk_level == "HIGH"
    assert prediction.reason == "Follow-up has remained unscheduled for 21 days."
    assert prediction.recommended_intervention == "Community health worker outreach"

    low = continuity.predict(ContinuityFeatures(days_since_result=2, days_since_referral=1, referral_status="scheduled",
                                                unscheduled_days=0, previous_missed_appointments=0, distance_category="near",
                                                facility_availability="available", referral_priority="standard",
                                                previous_follow_up_completed=True, appointment_delay_days=5))
    assert low.risk_level == "LOW"


def test_care_gap_detection(client, auth):
    ramon = auth("ramon.bautista")
    bcho = client.get("/api/organizations", headers=ramon).json()[0]
    gaps = client.get(f"/api/organizations/{bcho['id']}/care-gaps", headers=ramon).json()
    by_type = {(a["barangay"], a["gap_type"]): a for a in gaps["alerts"]}
    san_isidro = by_type[("San Isidro", "low_participation")]
    assert san_isidro["metrics"][0]["value"] == pytest.approx(0.34, abs=0.01)
    assert san_isidro["recommendation"] == "Increase kit distribution and community outreach."
    mabini = by_type[("Mabini", "follow_up_loss")]
    assert mabini["recommendation"] == "Investigate referral accessibility."
