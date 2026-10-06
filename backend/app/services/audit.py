"""Audit logging. Every access to patient data records who, where, what and when — never the data itself."""

import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.deps import client_ip
from app.models import AuditLog, User


def record(
    db: Session,
    user: User | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | str | None = None,
    *,
    patient_id: uuid.UUID | None = None,
    request: Request | None = None,
    detail: dict | None = None,
) -> None:
    org = user.organization if user is not None else None
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            user_label=user.email if user else "system",
            role=user.role if user else "system",
            organization_id=org.id if org else None,
            institution_name=org.name if org else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            subject_patient_id=patient_id,
            ip_address=client_ip(request) if request else None,
            detail=detail or {},
        )
    )
