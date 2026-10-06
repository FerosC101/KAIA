import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.serializers import continuity_dict, referral_detail, referral_summary
from app.core.deps import AnyUser, WorkerUser
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.security import parse_referral_qr_token
from app.db.session import get_db
from app.models import FollowUp, Organization, Referral, Screening, User
from app.models.enums import ConsentScope, EventSource, ReferralStatus, Role
from app.schemas.inputs import FollowUpIn, ReferralCreateIn, ReferralUpdateIn, ReferralVerifyIn
from app.services import audit, care, continuity
from app.services.access import ensure_referral_access, ensure_screening_access, worker_can_view_patient

router = APIRouter(tags=["KAIA Care — Referrals"])


def load_referral(db: Session, referral_id: uuid.UUID) -> Referral:
    referral = db.get(Referral, referral_id)
    if referral is None:
        raise not_found("Referral")
    return referral


@router.post("/referrals", status_code=201, summary="Generate a referral from a care pathway")
def create_referral(body: ReferralCreateIn, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    if user.role not in (Role.patient, Role.health_worker):
        raise forbidden("Only patients and health workers can create referrals")
    screening = db.get(Screening, body.screening_id)
    if screening is None:
        raise not_found("Screening")
    ensure_screening_access(db, user, screening)
    if user.role == Role.health_worker and user.organization_id != screening.organization_id:
        raise forbidden("Referrals are issued by the screening site")
    if screening.care_pathway is None:
        raise conflict("The screening result has not been released yet")
    destination = db.get(Organization, body.destination_org_id)
    if destination is None or not destination.active:
        raise not_found("Destination facility")
    referral = care.create_referral(db, screening.care_pathway, user, destination, body.preferred_schedule, body.notes)
    audit.record(db, user, "referral.create", "referral", referral.id, patient_id=referral.patient_id, request=request,
                 detail={"destination": destination.code, "priority": referral.priority})
    db.commit()
    return referral_detail(db, referral, user)


@router.get("/referrals", summary="Referral worklist for my organization (incoming or outgoing)")
def list_referrals(
    direction: Literal["incoming", "outgoing", "all"] = "all",
    status: ReferralStatus | None = None,
    user: User = WorkerUser,
    db: Session = Depends(get_db),
):
    org = user.organization_id
    query = select(Referral).order_by(Referral.generated_at.desc()).limit(200)
    if direction == "incoming":
        query = query.where(Referral.destination_org_id == org)
    elif direction == "outgoing":
        query = query.where(Referral.source_org_id == org)
    else:
        query = query.where(or_(Referral.destination_org_id == org, Referral.source_org_id == org))
    if status:
        query = query.where(Referral.status == status)
    rows = []
    for referral in db.scalars(query):
        has_access = worker_can_view_patient(db, user, referral.patient_id, [ConsentScope.referral, ConsentScope.screening])
        row = {
            **referral_summary(referral),
            "direction": "incoming" if referral.destination_org_id == org else "outgoing",
            "patient_code": referral.patient.patient_code,
            "patient_name": referral.patient.user.full_name if has_access else None,
            "access_restricted": not has_access,
            "continuity": None,
        }
        if has_access and referral.care_pathway.status == "active" and referral.status != ReferralStatus.cancelled:
            prediction = continuity.assess(db, referral.care_pathway)
            row["continuity"] = {"risk_level": prediction.risk_level, "score": prediction.score, "reason": prediction.reason}
        rows.append(row)
    return rows


@router.get("/referrals/{referral_id}", summary="Referral detail (consent-checked)")
def get_referral(referral_id: uuid.UUID, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    referral = load_referral(db, referral_id)
    ensure_referral_access(db, user, referral)
    audit.record(db, user, "referral.view", "referral", referral.id, patient_id=referral.patient_id, request=request)
    db.commit()
    return referral_detail(db, referral, user)


@router.patch("/referrals/{referral_id}", summary="Update referral status (schedule, attended, completed, missed, cancelled)")
def update_referral(
    referral_id: uuid.UUID, body: ReferralUpdateIn, request: Request, user: User = AnyUser, db: Session = Depends(get_db)
):
    referral = load_referral(db, referral_id)
    ensure_referral_access(db, user, referral)
    previous = referral.status
    care.transition_referral(db, referral, user, body.status, scheduled_for=body.scheduled_for, notes=body.notes,
                             completion_outcome=body.completion_outcome)
    audit.record(db, user, "referral.update", "referral", referral.id, patient_id=referral.patient_id, request=request,
                 detail={"from": previous, "to": body.status})
    db.commit()
    return referral_detail(db, referral, user)


@router.post("/referrals/verify", summary="Resolve a scanned referral QR code (authorized facilities only)")
def verify_referral(body: ReferralVerifyIn, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    referral_id = parse_referral_qr_token(body.token)
    if referral_id is None:
        raise bad_request("This QR code is not a valid KAIA referral")
    referral = load_referral(db, referral_id)
    ensure_referral_access(db, user, referral)
    audit.record(db, user, "referral.qr_verified", "referral", referral.id, patient_id=referral.patient_id, request=request)
    db.commit()
    return {**referral_detail(db, referral, user), "verified": True}


@router.post("/followups", status_code=201, tags=["KAIA Care — Follow-up"], summary="Record a follow-up event")
def create_follow_up(body: FollowUpIn, request: Request, user: User = AnyUser, db: Session = Depends(get_db)):
    referral = load_referral(db, body.referral_id)
    ensure_referral_access(db, user, referral)
    if user.role == Role.patient:
        if body.event_type != "attended":
            raise forbidden("Patients can only self-report attendance")
        if referral.status != ReferralStatus.scheduled:
            raise conflict("Attendance can be reported once an appointment is scheduled")
        event = FollowUp(referral_id=referral.id, event_type="attended", source=EventSource.patient, verified=False,
                         recorded_by_id=user.id, notes=None)
    else:
        if body.event_type == "attended":
            raise bad_request("Facilities record attendance via PATCH /referrals/{id} with status 'attended'")
        if referral.status in (ReferralStatus.completed, ReferralStatus.cancelled):
            raise conflict("This referral is closed")
        event = FollowUp(referral_id=referral.id, event_type=body.event_type, source=EventSource.health_worker,
                         verified=True, recorded_by_id=user.id, notes=body.notes)
    db.add(event)
    db.flush()
    referral.follow_ups.append(event)
    audit.record(db, user, "followup.create", "referral", referral.id, patient_id=referral.patient_id, request=request,
                 detail={"event_type": body.event_type})
    db.commit()
    return referral_detail(db, referral, user)


@router.get("/referrals/{referral_id}/continuity", tags=["KAIA Continuity Engine"], summary="Continuity risk for a referral")
def referral_continuity(referral_id: uuid.UUID, user: User = WorkerUser, db: Session = Depends(get_db)):
    referral = load_referral(db, referral_id)
    ensure_referral_access(db, user, referral)
    return continuity_dict(continuity.assess(db, referral.care_pathway))
