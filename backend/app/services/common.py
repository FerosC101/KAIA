"""Small shared helpers: human-readable codes, notifications, passport entries."""

import secrets
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, PassportEvent


def unique_code(db: Session, model, column, prefix: str, digits: int = 5) -> str:
    for _ in range(20):
        code = f"{prefix}{secrets.randbelow(10**digits):0{digits}d}"
        if db.scalar(select(model).where(column == code)) is None:
            return code
    raise RuntimeError("Could not allocate a unique code")


def notify(
    db: Session, user_id: uuid.UUID, title: str, body: str, category: str, link: str | None = None
) -> None:
    db.add(Notification(user_id=user_id, title=title, body=body, category=category, link=link))


def passport_event(
    db: Session,
    patient_id: uuid.UUID,
    *,
    event_date: date,
    event_type: str,
    title: str,
    institution_name: str,
    status: str,
    source: str = "kaia_platform",
    verified: bool = True,
    detail: str | None = None,
    screening_id: uuid.UUID | None = None,
    referral_id: uuid.UUID | None = None,
) -> PassportEvent:
    event = PassportEvent(
        patient_id=patient_id,
        event_date=event_date,
        event_type=event_type,
        title=title,
        detail=detail,
        institution_name=institution_name,
        status=status,
        source=source,
        verified=verified,
        screening_id=screening_id,
        referral_id=referral_id,
    )
    db.add(event)
    return event


def upsert_passport_event(
    db: Session, patient_id: uuid.UUID, *, event_type: str, screening_id=None, referral_id=None, **fields
) -> PassportEvent:
    """Update the existing passport entry for the same screening/referral event, or create it."""
    query = select(PassportEvent).where(PassportEvent.patient_id == patient_id, PassportEvent.event_type == event_type)
    if screening_id is not None:
        query = query.where(PassportEvent.screening_id == screening_id)
    if referral_id is not None:
        query = query.where(PassportEvent.referral_id == referral_id)
    existing = db.scalar(query)
    if existing is None:
        return passport_event(
            db, patient_id, event_type=event_type, screening_id=screening_id, referral_id=referral_id, **fields
        )
    for key, value in fields.items():
        setattr(existing, key, value)
    return existing


AGE_BRACKETS = [(25, 29), (30, 39), (40, 49), (50, 65)]


def age_bracket_for(birth: date, today: date | None = None) -> str:
    today = today or date.today()
    age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
    for lo, hi in AGE_BRACKETS:
        if lo <= age <= hi:
            return f"{lo}-{hi}"
    return "under-25" if age < 25 else "65+"
