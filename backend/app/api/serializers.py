"""Response shaping. Centralised so that data minimisation rules live in one place."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import referral_qr_token, sign_file_path
from app.core.config import settings
from app.models import (
    AIAnalysis,
    CarePathway,
    Consent,
    InventoryBatch,
    Organization,
    PassportEvent,
    PathwayConfig,
    Reader,
    Referral,
    RiskRule,
    Screening,
    User,
)
from app.models.enums import (
    ConsentScope,
    ReaderStatus,
    ReferralStatus,
    Role,
    ScreeningOutcome,
    ScreeningStatus,
)
from app.services import care, continuity
from app.services.access import worker_can_view_patient

STATUS_LABELS = {
    ScreeningStatus.kit_registered: "Kit registered",
    ScreeningStatus.sample_collected: "Sample returned",
    ScreeningStatus.cartridge_registered: "Cartridge registered",
    ScreeningStatus.analyzing: "Analyzing",
    ScreeningStatus.pending_review: "Awaiting clinician review",
    ScreeningStatus.result_ready: "Result ready",
    ScreeningStatus.invalid_sample: "Sample could not be analyzed",
}

OUTCOME_LABELS = {
    ScreeningOutcome.routine_screening: "Low immediate concern",
    ScreeningOutcome.follow_up_recommended: "Follow-up recommended",
    ScreeningOutcome.priority_follow_up: "Priority follow-up",
}

REFERRAL_STATUS_LABELS = {s: s.value.capitalize() for s in ReferralStatus}

SCOPE_LABELS = {
    ConsentScope.screening: "Screening information",
    ConsentScope.referral: "Referral information",
    ConsentScope.passport: "KAIA Passport history",
    ConsentScope.anonymous_statistics: "Anonymous statistics only",
}

DISCLAIMER = "This is a screening result and is not a diagnosis."


def org_ref(org: Organization | None) -> dict | None:
    return {"id": str(org.id), "name": org.name, "org_type": org.org_type} if org else None


def first_name(user: User) -> str:
    return (user.full_name or "").split(" ")[0]


# --- patient-facing ----------------------------------------------------------


def journey(screening: Screening) -> list[dict]:
    s = screening.status
    pathway = screening.care_pathway
    referral = care.active_referral(pathway) if pathway else None
    routine = screening.outcome == ScreeningOutcome.routine_screening and s == ScreeningStatus.result_ready

    def step(key, label, state, date=None, note=None):
        return {"key": key, "label": label, "state": state, "date": date, "note": note}

    analyzed_state = "done" if screening.analysis_completed_at else (
        "current" if s in (ScreeningStatus.cartridge_registered, ScreeningStatus.analyzing) else "pending"
    )
    if s == ScreeningStatus.invalid_sample:
        analyzed_state = "attention"
    steps = [
        step("kit_registered", "Kit Registered", "done", screening.registered_at),
        step("sample_collected", "Sample Collected", "done" if screening.sample_collected_at else "current",
             screening.sample_collected_at),
        step("sample_analyzed", "Sample Analyzed", analyzed_state, screening.analysis_completed_at,
             "Sample could not be analyzed" if s == ScreeningStatus.invalid_sample else None),
        step("result_ready", "Result Ready",
             "done" if screening.released_at else ("current" if s == ScreeningStatus.pending_review else "pending"),
             screening.released_at, "Clinician reviewing" if s == ScreeningStatus.pending_review else None),
    ]
    if routine:
        steps.append(step("referral", "Referral", "not_needed", note="Not needed"))
        steps.append(step("follow_up", "Follow-Up", "not_needed", note="Routine screening"))
    elif s == ScreeningStatus.result_ready:
        steps.append(step("referral", "Referral", "done" if referral else "current",
                          referral.generated_at if referral else None))
        if referral and referral.status == ReferralStatus.completed:
            steps.append(step("follow_up", "Follow-Up", "done", pathway.completed_at))
        elif referral:
            steps.append(step("follow_up", "Follow-Up", "current", None, referral.status.capitalize()))
        else:
            steps.append(step("follow_up", "Follow-Up", "pending"))
    else:
        steps.append(step("referral", "Referral", "pending"))
        steps.append(step("follow_up", "Follow-Up", "pending"))
    return steps


def patient_result_card(db: Session, screening: Screening) -> dict | None:
    if screening.status != ScreeningStatus.result_ready or not screening.outcome:
        return None
    config = db.scalar(select(PathwayConfig).where(PathwayConfig.outcome == screening.outcome))
    return {
        "outcome": screening.outcome,
        "label": OUTCOME_LABELS[screening.outcome],
        "message": config.patient_message if config else "",
        "next_step": config.next_step_message if config else "",
        "disclaimer": DISCLAIMER,
        "released_at": screening.released_at,
    }


def patient_screening(db: Session, screening: Screening) -> dict:
    return {
        "id": str(screening.id),
        "screening_code": screening.screening_code,
        "kit_code": screening.kit.kit_code,
        "status": screening.status,
        "status_label": STATUS_LABELS[screening.status],
        "site": org_ref(screening.organization),
        "registered_at": screening.registered_at,
        "sample_collected_at": screening.sample_collected_at,
        "analysis_completed_at": screening.analysis_completed_at,
        "released_at": screening.released_at,
        "result": patient_result_card(db, screening),
        "journey": journey(screening),
        "care_pathway_id": str(screening.care_pathway.id) if screening.care_pathway else None,
    }


def passport_entry(event: PassportEvent) -> dict:
    return {
        "id": str(event.id),
        "event_date": event.event_date,
        "event_type": event.event_type,
        "title": event.title,
        "detail": event.detail,
        "institution_name": event.institution_name,
        "status": event.status,
        "source": event.source,
        "verified": event.verified,
    }


# --- care -------------------------------------------------------------------


def referral_summary(referral: Referral) -> dict:
    appointment = referral.appointments[-1] if referral.appointments else None
    return {
        "id": str(referral.id),
        "referral_code": referral.referral_code,
        "status": referral.status,
        "priority": referral.priority,
        "referral_type": referral.referral_type,
        "referral_type_label": care.REFERRAL_TYPE_LABELS.get(referral.referral_type, referral.referral_type),
        "generated_at": referral.generated_at,
        "preferred_schedule": referral.preferred_schedule,
        "source_org": org_ref(referral.source_org),
        "destination_org": org_ref(referral.destination_org),
        "appointment_at": appointment.scheduled_for if appointment else None,
        "appointment_status": appointment.status if appointment else None,
    }


def referral_detail(db: Session, referral: Referral, viewer: User) -> dict:
    is_patient = viewer.role == Role.patient
    token = referral_qr_token(referral.id)
    allowed = sorted(care.REFERRAL_TRANSITIONS.get(referral.status, set()))
    if is_patient:
        allowed = [s for s in allowed if s in care.PATIENT_TRANSITIONS]
    data = {
        **referral_summary(referral),
        "screening": {
            "id": str(referral.screening_id),
            "screening_code": referral.screening.screening_code,
            "outcome": referral.screening.outcome,
            "outcome_label": OUTCOME_LABELS.get(referral.screening.outcome),
            "released_at": referral.screening.released_at,
        },
        "patient": {
            "patient_code": referral.patient.patient_code,
            "name": referral.patient.user.full_name if (is_patient or worker_can_view_patient(
                db, viewer, referral.patient_id, [ConsentScope.referral, ConsentScope.screening])) else None,
            "age_bracket": referral.patient.age_bracket,
        },
        "destination_facility": care.facility_summary(referral.destination_org),
        "appointments": [
            {"id": str(a.id), "scheduled_for": a.scheduled_for, "status": a.status} for a in referral.appointments
        ],
        "follow_ups": [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "occurred_at": e.occurred_at,
                "source": e.source,
                "verified": e.verified,
                "notes": None if is_patient else e.notes,
            }
            for e in referral.follow_ups
        ],
        "qr": {"token": token, "url": f"{settings.public_app_url}/portal/referrals/scan?token={token}"},
        "allowed_transitions": allowed,
        "completion_outcomes": care.COMPLETION_OUTCOMES,
        "clinical_notes": None if is_patient else referral.clinical_notes,
    }
    if not is_patient and referral.care_pathway.status == "active":
        data["continuity"] = continuity_dict(continuity.assess(db, referral.care_pathway))
    return data


def continuity_dict(prediction: continuity.ContinuityPrediction) -> dict:
    return {
        "risk_level": prediction.risk_level,
        "score": prediction.score,
        "reason": prediction.reason,
        "recommended_intervention": prediction.recommended_intervention,
        "contributions": prediction.contributions,
        "features": prediction.features,
        "model_version": prediction.model_version,
    }


def care_view(db: Session, pathway: CarePathway, viewer: User) -> dict:
    config = care.get_pathway_config(db, pathway.pathway_type)
    data = {
        "pathway": {
            "id": str(pathway.id),
            "pathway_type": pathway.pathway_type,
            "outcome_label": OUTCOME_LABELS[pathway.pathway_type],
            "current_stage": pathway.current_stage,
            "status": pathway.status,
            "recommended_action": pathway.recommended_action,
            "timeframe_days": pathway.timeframe_days,
            "timeframe_label": care.timeframe_label(pathway.timeframe_days),
            "due_date": pathway.due_date,
            "completed_at": pathway.completed_at,
        },
        "screening": {
            "id": str(pathway.screening_id),
            "screening_code": pathway.screening.screening_code,
            "kit_code": pathway.screening.kit.kit_code,
            "released_at": pathway.screening.released_at,
        },
        "steps": care.pathway_steps(pathway),
        "next_best_action": care.next_best_action(pathway),
        "referrals": [referral_summary(r) for r in pathway.referrals],
        "facility_options": [care.facility_summary(o) for o in care.facilities_for_service(db, config.required_service)]
        if pathway.pathway_type != ScreeningOutcome.routine_screening else [],
        "recommended_facility_id": str(pathway.recommended_facility_id) if pathway.recommended_facility_id else None,
    }
    if viewer.role != Role.patient and pathway.status == "active":
        data["continuity"] = continuity_dict(continuity.assess(db, pathway))
    return data


# --- devices / vision ----------------------------------------------------------


def temperature_label(temp: float) -> str:
    if 18 <= temp <= 30:
        return "Normal"
    return "High" if temp > 30 else "Low"


def reader_dict(reader: Reader, db: Session | None = None) -> dict:
    current = None
    active_screening = None
    if db is not None:
        active_screening = db.scalar(
            select(Screening).where(
                Screening.reader_id == reader.id,
                Screening.status.in_([ScreeningStatus.cartridge_registered, ScreeningStatus.analyzing]),
            )
        )
    if reader.current_cartridge is not None:
        current = {"cartridge_code": reader.current_cartridge.cartridge_code}
    return {
        "id": str(reader.id),
        "reader_code": reader.reader_code,
        "serial_number": reader.serial_number,
        "organization": org_ref(reader.organization),
        "location_name": reader.location_name,
        "status": reader.status,
        "firmware_version": reader.firmware_version,
        "temperature_c": reader.temperature_c,
        "temperature_label": temperature_label(reader.temperature_c),
        "last_calibration": reader.last_calibration,
        "last_heartbeat_at": reader.last_heartbeat_at,
        "total_analyses": reader.total_analyses,
        "is_available": reader.status == ReaderStatus.online,
        "current_cartridge": current,
        "active_screening": {
            "id": str(active_screening.id),
            "screening_code": active_screening.screening_code,
            "patient_code": active_screening.patient.patient_code,
            "status": active_screening.status,
            "analysis_stage": active_screening.analysis_stage,
            "sim_profile": active_screening.cartridge.sim_profile if active_screening.cartridge else None,
        } if active_screening else None,
    }


def analysis_dict(analysis: AIAnalysis) -> dict:
    return {
        "id": str(analysis.id),
        "model_version": analysis.model_version,
        "analysis_type": analysis.analysis_type,
        "image_url": sign_file_path(analysis.image_url),
        "regions": analysis.regions,
        "signal_intensity": analysis.signal_intensity,
        "control_validity": analysis.control_validity,
        "prediction": analysis.prediction,
        "confidence": analysis.confidence,
        "confidence_score": analysis.confidence_score,
        "pipeline": analysis.pipeline,
        "timestamp": analysis.created_at,
    }


def vision_view(screening: Screening) -> dict:
    assay = screening.assay_result
    return {
        "screening_id": str(screening.id),
        "screening_code": screening.screening_code,
        "patient_code": screening.patient.patient_code,
        "cartridge_code": screening.cartridge.cartridge_code if screening.cartridge else None,
        "reader_code": screening.reader.reader_code if screening.reader else None,
        "status": screening.status,
        "status_label": STATUS_LABELS[screening.status],
        "outcome": screening.outcome,
        "outcome_label": OUTCOME_LABELS.get(screening.outcome),
        "decision_trace": screening.decision_trace,
        "released_at": screening.released_at,
        "reviewed_at": screening.reviewed_at,
        "assay": {
            "id": str(assay.id),
            "control_valid": assay.control_valid,
            "hpv_signal": assay.hpv_signal,
            "hpv_genotype": assay.hpv_genotype,
            "secondary_marker": assay.secondary_marker,
            "sample_quality": assay.sample_quality,
            "assay_confidence": assay.assay_confidence,
            "captured_at": assay.captured_at,
            "analyses": [analysis_dict(a) for a in assay.analyses],
        } if assay else None,
        "disclaimer": DISCLAIMER,
    }


# --- privacy / admin --------------------------------------------------------------


def consent_dict(consent: Consent) -> dict:
    return {
        "id": str(consent.id),
        "grantee_name": consent.grantee_name,
        "organization": org_ref(consent.organization),
        "scope": consent.scope,
        "scope_label": SCOPE_LABELS.get(consent.scope, consent.scope),
        "status": consent.status,
        "granted_at": consent.granted_at,
        "revoked_at": consent.revoked_at,
        "granted_via": consent.granted_via,
    }


def inventory_dict(batch: InventoryBatch, today) -> dict:
    days_to_expiry = (batch.expiry_date - today).days
    return {
        "id": str(batch.id),
        "organization": org_ref(batch.organization),
        "item_type": batch.item_type,
        "batch_number": batch.batch_number,
        "manufacture_date": batch.manufacture_date,
        "expiry_date": batch.expiry_date,
        "initial_quantity": batch.initial_quantity,
        "quantity": batch.quantity,
        "reorder_threshold": batch.reorder_threshold,
        "location": batch.location,
        "status": batch.status,
        "low_stock": batch.status == "available" and batch.quantity <= batch.reorder_threshold,
        "expiring_soon": 0 <= days_to_expiry <= 60,
        "expired": days_to_expiry < 0,
        "days_to_expiry": days_to_expiry,
    }


def rule_dict(rule: RiskRule) -> dict:
    return {
        "id": str(rule.id),
        "pathway_key": rule.pathway_key,
        "name": rule.name,
        "description": rule.description,
        "priority": rule.priority,
        "conditions": rule.conditions,
        "outcome": rule.outcome,
        "outcome_label": OUTCOME_LABELS.get(rule.outcome),
        "active": rule.active,
        "updated_at": rule.updated_at,
    }


def user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "organization": org_ref(user.organization),
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "is_demo": user.is_demo,
    }
