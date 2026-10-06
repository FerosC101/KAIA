import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import consent_dict, org_ref
from app.core.deps import AnyUser, PatientUser, require_roles
from app.core.errors import bad_request, conflict, not_found
from app.db.session import get_db
from app.models import AuditLog, Barangay, Consent, Notification, Organization, User
from app.models.enums import ConsentScope, ConsentStatus, Role
from app.schemas.inputs import ConsentIn
from app.services import audit, care
from app.services.access import patient_profile_for

router = APIRouter()

RESEARCH_PROGRAM = "KAIA Research Program"


# --- Consent ------------------------------------------------------------------


@router.get("/consents", tags=["Consent & Privacy"], summary="Who can access my data")
def list_consents(user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    consents = db.scalars(select(Consent).where(Consent.patient_id == p.id).order_by(Consent.granted_at.desc()))
    return [consent_dict(c) for c in consents]


@router.get("/consents/grantees", tags=["Consent & Privacy"], summary="Organizations I can grant access to")
def grantees(user: User = PatientUser, db: Session = Depends(get_db)):
    orgs = db.scalars(select(Organization).where(Organization.active.is_(True)).order_by(Organization.name))
    return [org_ref(o) for o in orgs]


@router.post("/consents", status_code=201, tags=["Consent & Privacy"], summary="Grant access")
def grant_consent(body: ConsentIn, request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    if body.scope == ConsentScope.anonymous_statistics:
        if body.organization_id is not None:
            raise bad_request("Anonymous statistics consent is granted to the KAIA Research Program only")
        existing = db.scalar(select(Consent).where(Consent.patient_id == p.id, Consent.scope == body.scope,
                                                   Consent.status == ConsentStatus.granted))
        if existing:
            raise conflict("Already granted")
        consent = Consent(patient_id=p.id, organization_id=None, grantee_name=RESEARCH_PROGRAM, scope=body.scope)
    else:
        if body.organization_id is None:
            raise bad_request("Choose an organization")
        org = db.get(Organization, body.organization_id)
        if org is None:
            raise not_found("Organization")
        existing = db.scalar(select(Consent).where(Consent.patient_id == p.id, Consent.organization_id == org.id,
                                                   Consent.scope == body.scope, Consent.status == ConsentStatus.granted))
        if existing:
            raise conflict("Access is already granted")
        consent = Consent(patient_id=p.id, organization_id=org.id, grantee_name=org.name, scope=body.scope)
    db.add(consent)
    db.flush()
    audit.record(db, user, "consent.grant", "consent", consent.id, patient_id=p.id, request=request,
                 detail={"scope": body.scope, "grantee": consent.grantee_name})
    db.commit()
    return consent_dict(consent)


@router.delete("/consents/{consent_id}", tags=["Consent & Privacy"], summary="Revoke access")
def revoke_consent(consent_id: uuid.UUID, request: Request, user: User = PatientUser, db: Session = Depends(get_db)):
    p = patient_profile_for(db, user)
    consent = db.get(Consent, consent_id)
    if consent is None or consent.patient_id != p.id:
        raise not_found("Consent")
    if consent.status == ConsentStatus.revoked:
        raise conflict("Access was already revoked")
    consent.status = ConsentStatus.revoked
    consent.revoked_at = datetime.now(UTC)
    audit.record(db, user, "consent.revoke", "consent", consent.id, patient_id=p.id, request=request,
                 detail={"scope": consent.scope, "grantee": consent.grantee_name})
    db.commit()
    return consent_dict(consent)


# --- Audit logs ------------------------------------------------------------------


@router.get("/audit-logs", tags=["Audit"], summary="Audit trail (system admin: all; institution admin: own organization)")
def audit_logs(
    action: str | None = Query(default=None, max_length=60),
    resource_type: str | None = Query(default=None, max_length=60),
    organization_id: uuid.UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_roles(Role.institution_admin, Role.system_admin)),
    db: Session = Depends(get_db),
):
    query = select(AuditLog)
    if user.role == Role.institution_admin:
        query = query.where(AuditLog.organization_id == user.organization_id)
    elif organization_id:
        query = query.where(AuditLog.organization_id == organization_id)
    if action:
        query = query.where(AuditLog.action.ilike(f"{action}%"))
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    logs = db.scalars(query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * page_size).limit(page_size))
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(log.id),
                "timestamp": log.timestamp,
                "user": log.user_label,
                "role": log.role,
                "institution": log.institution_name,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "subject": "patient record" if log.subject_patient_id else None,
                "ip_address": log.ip_address,
                "detail": log.detail,
            }
            for log in logs
        ],
    }


# --- Notifications -------------------------------------------------------------------


@router.get("/notifications", tags=["Notifications"], summary="My notifications")
def notifications(user: User = AnyUser, db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50))
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    return {
        "unread": unread or 0,
        "items": [
            {"id": str(n.id), "title": n.title, "body": n.body, "category": n.category, "link": n.link,
             "read": n.read_at is not None, "created_at": n.created_at}
            for n in items
        ],
    }


@router.post("/notifications/{notification_id}/read", tags=["Notifications"], status_code=204)
def mark_read(notification_id: uuid.UUID, user: User = AnyUser, db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise not_found("Notification")
    n.read_at = n.read_at or datetime.now(UTC)
    db.commit()


@router.post("/notifications/read-all", tags=["Notifications"], status_code=204)
def mark_all_read(user: User = AnyUser, db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))):
        n.read_at = now
    db.commit()


# --- Facilities & public lookups ------------------------------------------------------


@router.get("/facilities", tags=["KAIA Care — Facilities"], summary="Partner facilities (optionally filtered by service)")
def facilities(service: str | None = Query(default=None, max_length=40), user: User = AnyUser, db: Session = Depends(get_db)):
    return [care.facility_summary(o) for o in care.facilities_for_service(db, service)]


@router.get("/facilities/{organization_id}", tags=["KAIA Care — Facilities"])
def facility(organization_id: uuid.UUID, user: User = AnyUser, db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if org is None:
        raise not_found("Facility")
    return care.facility_summary(org)


@router.get("/public/barangays", tags=["Public"], summary="Barangay names for registration (no personal data)")
def public_barangays(db: Session = Depends(get_db)):
    return [{"id": str(b.id), "name": b.name, "city": b.city} for b in db.scalars(select(Barangay).order_by(Barangay.name))]
