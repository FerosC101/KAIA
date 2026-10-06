"""Consent-based, server-side access control for patient health data.

Rules (Privacy by Design):
- A patient can always access her own records.
- A health worker can access a patient's records only while the patient has an active
  consent for the worker's organization covering the required scope.
- Institution and system admins never see identifiable health records through these paths;
  they work with aggregate or pseudonymous data only.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import forbidden, not_found
from app.models import Consent, PatientProfile, Referral, Screening, User
from app.models.enums import ConsentScope, ConsentStatus, Role


def patient_profile_for(db: Session, user: User) -> PatientProfile:
    profile = db.scalar(select(PatientProfile).where(PatientProfile.user_id == user.id))
    if profile is None:
        raise not_found("Patient profile")
    return profile


def active_consent(
    db: Session, patient_id: uuid.UUID, organization_id: uuid.UUID | None, scopes: Iterable[str]
) -> Consent | None:
    if organization_id is None:
        return None
    return db.scalar(
        select(Consent).where(
            Consent.patient_id == patient_id,
            Consent.organization_id == organization_id,
            Consent.scope.in_(list(scopes)),
            Consent.status == ConsentStatus.granted,
        )
    )


def worker_can_view_patient(db: Session, user: User, patient_id: uuid.UUID, scopes: Iterable[str]) -> bool:
    return user.role == Role.health_worker and active_consent(db, patient_id, user.organization_id, scopes) is not None


def ensure_screening_access(db: Session, user: User, screening: Screening) -> None:
    if user.role == Role.patient:
        if screening.patient.user_id != user.id:
            raise not_found("Screening")  # do not reveal existence
        return
    if user.role == Role.health_worker:
        if active_consent(db, screening.patient_id, user.organization_id, [ConsentScope.screening]):
            return
        raise forbidden("The patient has not granted your organization access to screening information")
    raise forbidden("Identifiable screening records are not available to this role")


def ensure_referral_access(db: Session, user: User, referral: Referral) -> None:
    if user.role == Role.patient:
        if referral.patient.user_id != user.id:
            raise not_found("Referral")
        return
    if user.role == Role.health_worker and user.organization_id is not None:
        org = user.organization_id
        if org == referral.destination_org_id and active_consent(
            db, referral.patient_id, org, [ConsentScope.referral, ConsentScope.screening]
        ):
            return
        if org == referral.source_org_id and active_consent(db, referral.patient_id, org, [ConsentScope.screening]):
            return
        raise forbidden("The patient has not granted your organization access to this referral")
    raise forbidden("Identifiable referral records are not available to this role")


def ensure_org_scope(user: User, organization_id: uuid.UUID) -> None:
    """Institution admins may only view their own organization; system admins may view any."""
    if user.role == Role.system_admin:
        return
    if user.role in (Role.institution_admin, Role.health_worker) and user.organization_id == organization_id:
        return
    raise forbidden("You can only view data for your own organization")
