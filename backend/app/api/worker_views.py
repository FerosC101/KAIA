"""Provider-portal views of screenings. Identity is shown only when the patient's consent allows it."""

from sqlalchemy.orm import Session

from app.api.serializers import OUTCOME_LABELS, REFERRAL_STATUS_LABELS, STATUS_LABELS, patient_screening
from app.models import Screening, User
from app.models.enums import ConsentScope, ScreeningOutcome, ScreeningStatus
from app.services import care
from app.services.access import worker_can_view_patient


def next_action(screening: Screening, has_access: bool) -> str | None:
    if not has_access:
        return None
    status = screening.status
    if status == ScreeningStatus.kit_registered:
        return "receive_sample"
    if status == ScreeningStatus.sample_collected:
        return "register_cartridge"
    if status == ScreeningStatus.cartridge_registered:
        return "begin_analysis"
    if status == ScreeningStatus.analyzing:
        return "view_reader"
    if status == ScreeningStatus.pending_review:
        return "review"
    if status == ScreeningStatus.result_ready and care.is_follow_up(screening.outcome):
        pathway = screening.care_pathway
        if pathway and care.active_referral(pathway) is None:
            return "create_referral"
    return "view"


def referral_label(screening: Screening) -> tuple[str | None, str]:
    if screening.status != ScreeningStatus.result_ready:
        return None, "—"
    if screening.outcome == ScreeningOutcome.routine_screening:
        return None, "Not needed"
    pathway = screening.care_pathway
    referral = care.active_referral(pathway) if pathway else None
    if referral is None:
        return None, "Not Created"
    return referral.status, REFERRAL_STATUS_LABELS[referral.status]


def queue_row(db: Session, screening: Screening, viewer: User) -> dict:
    has_access = worker_can_view_patient(db, viewer, screening.patient_id, [ConsentScope.screening])
    show_outcome = has_access and screening.status in (ScreeningStatus.pending_review, ScreeningStatus.result_ready)
    ref_status, ref_label = referral_label(screening) if has_access else (None, "—")
    return {
        "screening_id": str(screening.id),
        "screening_code": screening.screening_code,
        "patient_code": screening.patient.patient_code,
        "patient_name": screening.patient.user.full_name if has_access else None,
        "access_restricted": not has_access,
        "kit_code": screening.kit.kit_code,
        "cartridge_code": screening.cartridge.cartridge_code if screening.cartridge else None,
        "reader_code": screening.reader.reader_code if screening.reader else None,
        "status": screening.status,
        "status_label": STATUS_LABELS[screening.status],
        "outcome": screening.outcome if show_outcome else None,
        "outcome_label": OUTCOME_LABELS.get(screening.outcome) if show_outcome else None,
        "outcome_released": screening.status == ScreeningStatus.result_ready,
        "referral_status": ref_status,
        "referral_label": ref_label,
        "registered_at": screening.registered_at,
        "updated_at": screening.updated_at,
        "next_action": next_action(screening, has_access),
    }


def screening_detail(db: Session, screening: Screening) -> dict:
    patient = screening.patient
    return {
        **patient_screening(db, screening),
        "patient": {
            "patient_code": patient.patient_code,
            "name": patient.user.full_name,
            "age_bracket": patient.age_bracket,
            "barangay": patient.barangay.name if patient.barangay else None,
            "distance_category": patient.distance_category,
        },
        "cartridge_code": screening.cartridge.cartridge_code if screening.cartridge else None,
        "reader_code": screening.reader.reader_code if screening.reader else None,
        "sim_profile": screening.cartridge.sim_profile if screening.cartridge else None,
        "analysis_stage": screening.analysis_stage,
        "outcome": screening.outcome,
        "outcome_label": OUTCOME_LABELS.get(screening.outcome),
        "decision_trace": screening.decision_trace,
        "reviewed_at": screening.reviewed_at,
        "review_notes": screening.review_notes,
        "has_assay": screening.assay_result is not None,
        "next_action": next_action(screening, True),
    }
