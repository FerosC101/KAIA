from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import org_ref, passport_entry, patient_screening, referral_summary
from app.core.deps import PatientUser
from app.core.errors import not_found
from app.db.session import get_db
from app.models import AuditLog, Barangay, Notification, Organization, PassportEvent, Referral, Screening, User
from app.schemas.inputs import PassportRecordIn, PatientUpdateIn
from app.services import audit, care
from app.services.access import patient_profile_for
from app.services.screening import IN_PROGRESS

router = APIRouter(prefix="/patients", tags=["Patients"])

ACTION_LABELS = {
    "screening.view": "Viewed screening record",
    "screening.result_view": "Viewed screening result",
    "screening.cartridge_registered": "Registered sample cartridge",
    "screening.reviewed": "Reviewed and released result",
    "screening.create": "Registered screening",
    "screening.sample_received": "Recorded sample received",
    "screening.vision_view": "Viewed KAIA Vision analysis",
    "reader.analysis_started": "Ran KAIA Reader analysis",
    "referral.view": "Viewed referral",
    "referral.create": "Created referral",
    "referral.update": "Updated referral",
    "referral.qr_verified": "Scanned referral QR code",
    "followup.create": "Recorded follow-up",
    "care.view": "Viewed care pathway",
    "assay.view": "Viewed assay analysis",
    "assay.reanalyze": "Re-ran KAIA Vision analysis",
}


def _screenings(db: Session, patient_id) -> list[Screening]:
    return list(db.scalars(select(Screening).where(Screening.patient_id == patient_id).order_by(Screening.registered_at.desc())))


@router.get("/me", summary="My patient profile")
def get_me(request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    audit.record(db, user, "patient.profile_view", "patient_profile", p.id, patient_id=p.id, request=request)
    db.commit()
    return {
        "patient_code": p.patient_code,
        "full_name": user.full_name,
        "email": user.email,
        "birth_date": p.birth_date,
        "age_bracket": p.age_bracket,
        "phone": p.phone,
        "barangay": {"id": str(p.barangay.id), "name": p.barangay.name} if p.barangay else None,
        "city": p.city,
        "distance_category": p.distance_category,
        "preferred_language": p.preferred_language,
    }


@router.patch("/me", summary="Update my contact preferences")
def update_me(body: PatientUpdateIn, request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    changes = body.model_dump(exclude_unset=True)
    if "barangay_id" in changes and changes["barangay_id"] and db.get(Barangay, changes["barangay_id"]) is None:
        raise not_found("Barangay")
    for key, value in changes.items():
        setattr(p, key, value)
    audit.record(db, user, "patient.profile_update", "patient_profile", p.id, patient_id=p.id, request=request,
                 detail={"fields": sorted(changes)})
    db.commit()
    return get_me(request, user, db)


@router.get("/me/dashboard", summary="Patient home: current screening, journey and next step")
def dashboard(request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    screenings = _screenings(db, p.id)
    current = screenings[0] if screenings else None
    pathway = current.care_pathway if current else None
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    sites = db.scalars(select(Organization).where(Organization.active.is_(True)).order_by(Organization.name))
    audit.record(db, user, "patient.dashboard_view", "screening", current.id if current else None, patient_id=p.id, request=request)
    db.commit()
    return {
        "first_name": (user.full_name or "").split(" ")[0],
        "patient_code": p.patient_code,
        "is_demo": user.is_demo,
        "current_screening": patient_screening(db, current) if current else None,
        "next_best_action": care.next_best_action(pathway) if pathway else None,
        "can_register_kit": current is None or current.status not in IN_PROGRESS,
        "unread_notifications": unread or 0,
        "screening_sites": [org_ref(o) for o in sites if "kaia_screening" in (o.services or [])],
        "passport_entries": db.scalar(select(func.count(PassportEvent.id)).where(PassportEvent.patient_id == p.id)) or 0,
        "screening_count": len(screenings),
    }


@router.get("/me/screenings", summary="All my screenings")
def my_screenings(request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    items = [patient_screening(db, s) for s in _screenings(db, p.id)]
    audit.record(db, user, "patient.screenings_view", "screening", None, patient_id=p.id, request=request)
    db.commit()
    return items


@router.get("/me/passport", summary="KAIA Passport — reproductive-health screening timeline")
def passport(request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    events = db.scalars(
        select(PassportEvent).where(PassportEvent.patient_id == p.id).order_by(PassportEvent.event_date, PassportEvent.created_at)
    )
    audit.record(db, user, "passport.view", "passport", p.id, patient_id=p.id, request=request)
    db.commit()
    return {
        "patient_code": p.patient_code,
        "full_name": user.full_name,
        "age_bracket": p.age_bracket,
        "entries": [passport_entry(e) for e in events],
        "scope_note": "KAIA Passport records reproductive-health screening events only. It is not a full medical record.",
    }


@router.post("/me/passport", status_code=201, summary="Add a self-reported screening history record")
def add_passport_record(body: PassportRecordIn, request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    event = PassportEvent(
        patient_id=p.id,
        event_date=body.event_date,
        event_type=body.event_type,
        title=body.title,
        institution_name=body.institution_name,
        status=body.status,
        source="self_reported",
        verified=False,
    )
    db.add(event)
    audit.record(db, user, "passport.record_add", "passport_event", None, patient_id=p.id, request=request)
    db.commit()
    return passport_entry(event)


@router.get("/me/referrals", summary="My referrals")
def my_referrals(request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    referrals = db.scalars(select(Referral).where(Referral.patient_id == p.id).order_by(Referral.generated_at.desc()))
    audit.record(db, user, "referral.list", "referral", None, patient_id=p.id, request=request)
    db.commit()
    return [referral_summary(r) for r in referrals]


@router.get("/me/access-log", summary="Who accessed my data")
def access_log(user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.subject_patient_id == p.id, AuditLog.user_id != user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(50)
    )
    return [
        {
            "id": str(log.id),
            "timestamp": log.timestamp,
            "institution_name": log.institution_name or "KAIA Platform",
            "role": log.role,
            "action": log.action,
            "action_label": ACTION_LABELS.get(log.action, log.action.replace(".", " ").replace("_", " ").capitalize()),
            "resource_type": log.resource_type,
        }
        for log in logs
    ]


@router.get("/barangays", summary="Barangays (for profile selection)")
def barangays(user: User = PatientUser, db: Session = Depends(get_db)):
    return [{"id": str(b.id), "name": b.name, "city": b.city} for b in db.scalars(select(Barangay).order_by(Barangay.name))]
