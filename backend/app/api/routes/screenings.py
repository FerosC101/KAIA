import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import (
    OUTCOME_LABELS,
    STATUS_LABELS,
    care_view,
    patient_result_card,
    patient_screening,
    vision_view,
)
from app.api.worker_views import queue_row, screening_detail
from app.core.deps import AnyUser, WorkerUser
from app.core.errors import conflict, forbidden, not_found
from app.db.session import get_db
from app.models import Kit, Organization, PatientProfile, Screening, User
from app.models.enums import ConsentScope, Role, ScreeningStatus
from app.schemas.inputs import CartridgeRegisterIn, KitRegisterIn, ReviewIn, ScreeningCreateIn
from app.services import audit, care
from app.services import screening as workflow
from app.services.access import ensure_screening_access, patient_profile_for

router = APIRouter(tags=["Screenings"])


def load_screening(db: Session, screening_id: uuid.UUID) -> Screening:
    screening = db.get(Screening, screening_id)
    if screening is None:
        raise not_found("Screening")
    return screening


def _worker_at_site(user: User, screening: Screening) -> None:
    if user.organization_id != screening.organization_id:
        raise forbidden("This action can only be performed by the screening site")


@router.post("/kits/register", status_code=201, tags=["Kits"], summary="Register a KAIA Kit to my account")
def register_kit(body: KitRegisterIn, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    if user.role != Role.patient:
        raise forbidden("Kits are registered by the patient. Health workers use POST /screenings.")
    patient = patient_profile_for(db, user)
    site = db.get(Organization, body.site_organization_id)
    if site is None:
        raise not_found("Screening site")
    screening = workflow.register_kit(db, patient, body.kit_code, site)
    audit.record(db, user, "kit.register", "screening", screening.id, patient_id=patient.id, request=request,
                 detail={"kit_code": screening.kit.kit_code, "site": site.code})
    db.commit()
    return patient_screening(db, screening)


@router.get("/kits/lookup/{kit_code}", tags=["Kits"], summary="Look up a kit's inventory status")
def lookup_kit(kit_code: str, user: User = WorkerUser, db: Session = Depends(get_db)):
    kit = db.scalar(select(Kit).where(Kit.kit_code == workflow.normalize_code(kit_code)))
    if kit is None or kit.organization_id != user.organization_id:
        raise not_found("Kit")
    return {"kit_code": kit.kit_code, "status": kit.status, "registered": kit.patient_id is not None}


@router.post("/screenings", status_code=201, summary="Register a walk-in screening (health worker)")
def create_screening(body: ScreeningCreateIn, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    patient = db.scalar(select(PatientProfile).where(PatientProfile.patient_code == workflow.normalize_code(body.patient_code)))
    if patient is None:
        raise not_found("Patient")
    org = user.organization
    care.ensure_consent(db, patient.id, org, ConsentScope.screening, "in_person")
    db.flush()
    screening = workflow.register_kit(db, patient, body.kit_code, org, consent_via="in_person")
    if body.sample_collected:
        workflow.mark_sample_collected(db, screening)
    audit.record(db, user, "screening.create", "screening", screening.id, patient_id=patient.id, request=request)
    db.commit()
    return queue_row(db, screening, user)


@router.get("/screenings/{screening_id}", summary="Screening record (consent-checked)")
def get_screening(screening_id: uuid.UUID, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    audit.record(db, user, "screening.view", "screening", screening.id, patient_id=screening.patient_id, request=request)
    db.commit()
    if user.role == Role.patient:
        return patient_screening(db, screening)
    return screening_detail(db, screening)


@router.get("/screenings/{screening_id}/result", summary="Screening result (released results only for patients)")
def get_result(screening_id: uuid.UUID, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    audit.record(db, user, "screening.result_view", "screening", screening.id, patient_id=screening.patient_id, request=request)
    db.commit()
    card = patient_result_card(db, screening)
    base = {
        "screening_id": str(screening.id),
        "screening_code": screening.screening_code,
        "kit_code": screening.kit.kit_code,
        "site": screening.organization.name,
        "status": screening.status,
        "status_label": STATUS_LABELS[screening.status],
        "ready": card is not None,
        "result": card,
        "care_pathway_id": str(screening.care_pathway.id) if screening.care_pathway else None,
    }
    if user.role == Role.patient:
        if screening.status == ScreeningStatus.invalid_sample:
            base["invalid_message"] = ("Your sample could not be analyzed. This is not a result and does not mean "
                                       "anything is wrong. Please collect a new sample with a new KAIA Kit.")
        return base
    return {**base, "vision": vision_view(screening) if screening.assay_result else None,
            "outcome": screening.outcome, "outcome_label": OUTCOME_LABELS.get(screening.outcome)}


@router.post("/screenings/{screening_id}/sample-collected", summary="Record that the sample was collected/returned")
def sample_collected(screening_id: uuid.UUID, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    if user.role == Role.health_worker:
        _worker_at_site(user, screening)
    workflow.mark_sample_collected(db, screening)
    audit.record(db, user, "screening.sample_received", "screening", screening.id, patient_id=screening.patient_id, request=request)
    db.commit()
    return patient_screening(db, screening) if user.role == Role.patient else screening_detail(db, screening)


@router.post("/screenings/{screening_id}/cartridge", summary="Register cartridge and insert into a KAIA Reader")
def register_cartridge(
    screening_id: uuid.UUID, body: CartridgeRegisterIn, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)
):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    workflow.register_cartridge(db, screening, user, body.cartridge_code, body.reader_code, body.sim_profile)
    audit.record(db, user, "screening.cartridge_registered", "screening", screening.id, patient_id=screening.patient_id,
                 request=request, detail={"cartridge": body.cartridge_code.upper(), "reader": body.reader_code.upper()})
    db.commit()
    return screening_detail(db, screening)


@router.post("/screenings/{screening_id}/review", summary="Clinician review: approve (or override) and release result")
def review(screening_id: uuid.UUID, body: ReviewIn, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    suggested = screening.outcome
    workflow.release_result(db, screening, user, body.override_outcome, body.notes)
    audit.record(db, user, "screening.reviewed", "screening", screening.id, patient_id=screening.patient_id, request=request,
                 detail={"suggested": suggested, "released": screening.outcome, "override": suggested != screening.outcome})
    db.commit()
    return screening_detail(db, screening)


@router.get("/screenings/{screening_id}/care", summary="KAIA Care pathway, steps and next best action")
def get_care(screening_id: uuid.UUID, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    if screening.care_pathway is None:
        raise conflict("A care pathway is created once the screening result is released")
    audit.record(db, user, "care.view", "care_pathway", screening.care_pathway.id, patient_id=screening.patient_id, request=request)
    db.commit()
    return care_view(db, screening.care_pathway, user)


@router.get("/screenings/{screening_id}/vision", summary="KAIA Vision interpretation (provider only)")
def get_vision(screening_id: uuid.UUID, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    screening = load_screening(db, screening_id)
    ensure_screening_access(db, user, screening)
    if screening.assay_result is None:
        raise conflict("This screening has not been analyzed yet")
    audit.record(db, user, "screening.vision_view", "screening", screening.id, patient_id=screening.patient_id, request=request)
    db.commit()
    return vision_view(screening)
