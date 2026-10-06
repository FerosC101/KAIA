from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.serializers import OUTCOME_LABELS, continuity_dict, org_ref, reader_dict
from app.api.worker_views import queue_row
from app.core.deps import WorkerUser
from app.core.errors import not_found
from app.core.timeutil import local_day_bounds, local_today
from app.db.session import get_db
from app.models import Cartridge, CarePathway, Kit, PatientProfile, Reader, Referral, Screening, User
from app.models.enums import (
    CartridgeStatus,
    ConsentScope,
    PathwayStatus,
    ScreeningOutcome,
    ScreeningStatus,
)
from app.services import care, continuity
from app.services.access import worker_can_view_patient
from app.services.screening import IN_PROGRESS, normalize_code

router = APIRouter(prefix="/worker", tags=["Health Worker"])

QUEUE_ORDER = {
    ScreeningStatus.pending_review: 0,
    ScreeningStatus.cartridge_registered: 1,
    ScreeningStatus.sample_collected: 2,
    ScreeningStatus.analyzing: 3,
    ScreeningStatus.kit_registered: 4,
    ScreeningStatus.result_ready: 5,
    ScreeningStatus.invalid_sample: 6,
}


def _today_filter(org_id):
    start, end = local_day_bounds()
    return and_(
        Screening.organization_id == org_id,
        or_(
            and_(Screening.registered_at >= start, Screening.registered_at < end),
            and_(Screening.sample_collected_at >= start, Screening.sample_collected_at < end),
            and_(Screening.analysis_completed_at >= start, Screening.analysis_completed_at < end),
            and_(Screening.released_at >= start, Screening.released_at < end),
        ),
    )


@router.get("/dashboard", summary="Health-worker metrics for my screening site")
def dashboard(user: User = WorkerUser, db: Session = Depends(get_db)):
    org = user.organization_id

    def count(*conditions) -> int:
        return db.scalar(select(func.count(Screening.id)).where(Screening.organization_id == org, *conditions)) or 0

    def pathways(outcome: str) -> int:
        return db.scalar(
            select(func.count(CarePathway.id))
            .join(Screening, Screening.id == CarePathway.screening_id)
            .where(Screening.organization_id == org, CarePathway.status == PathwayStatus.active, CarePathway.pathway_type == outcome)
        ) or 0

    unresolved = db.scalar(
        select(func.count(Referral.id)).where(
            or_(Referral.source_org_id == org, Referral.destination_org_id == org),
            Referral.status.in_(list(care.ACTIVE_REFERRAL_STATUSES)),
        )
    ) or 0
    readers = list(db.scalars(select(Reader).where(Reader.organization_id == org).order_by(Reader.reader_code)))
    return {
        "organization": org_ref(user.organization),
        "worker": {"name": user.full_name, "position": user.health_worker.position if user.health_worker else None},
        "today": local_today(),
        "metrics": {
            "todays_screenings": db.scalar(select(func.count(Screening.id)).where(_today_filter(org))) or 0,
            "pending_analysis": count(Screening.status.in_([ScreeningStatus.sample_collected, ScreeningStatus.cartridge_registered, ScreeningStatus.analyzing])),
            "awaiting_review": count(Screening.status == ScreeningStatus.pending_review),
            "follow_up_required": pathways(ScreeningOutcome.follow_up_recommended),
            "priority_follow_up": pathways(ScreeningOutcome.priority_follow_up),
            "unresolved_referrals": unresolved,
            "cartridges_in_stock": db.scalar(select(func.count(Cartridge.id)).where(
                Cartridge.organization_id == org, Cartridge.status == CartridgeStatus.in_stock)) or 0,
        },
        "readers": [reader_dict(r, db) for r in readers],
    }


@router.get("/queue", summary="Screening queue for my site")
def queue(
    scope: Literal["active", "today", "all"] = "active",
    status: ScreeningStatus | None = None,
    q: str | None = Query(default=None, max_length=40),
    user: User = WorkerUser,
    db: Session = Depends(get_db),
):
    org = user.organization_id
    query = select(Screening).join(PatientProfile, PatientProfile.id == Screening.patient_id).join(Kit, Kit.id == Screening.kit_id)
    if scope == "today":
        query = query.where(_today_filter(org))
    else:
        query = query.where(Screening.organization_id == org)
    if scope == "active":
        start, _ = local_day_bounds()
        query = query.where(or_(
            Screening.status.in_(list(IN_PROGRESS)),
            Screening.released_at >= start - timedelta(days=14),
            and_(Screening.status == ScreeningStatus.invalid_sample, Screening.analysis_completed_at >= start - timedelta(days=14)),
        ))
    if status:
        query = query.where(Screening.status == status)
    if q:
        term = f"%{q.strip().upper()}%"
        query = query.outerjoin(Cartridge, Cartridge.id == Screening.cartridge_id).where(
            or_(PatientProfile.patient_code.ilike(term), Kit.kit_code.ilike(term), Cartridge.cartridge_code.ilike(term))
        )
    screenings = list(db.scalars(query.order_by(Screening.updated_at.desc()).limit(200)))
    screenings.sort(key=lambda s: (QUEUE_ORDER.get(s.status, 9), -s.updated_at.timestamp()))
    return [queue_row(db, s, user) for s in screenings]


@router.get("/follow-ups", summary="Active follow-up pathways with KAIA Continuity Engine risk")
def follow_ups(user: User = WorkerUser, db: Session = Depends(get_db)):
    org = user.organization_id
    pathways = db.scalars(
        select(CarePathway)
        .join(Screening, Screening.id == CarePathway.screening_id)
        .where(
            CarePathway.status == PathwayStatus.active,
            CarePathway.pathway_type != ScreeningOutcome.routine_screening,
            or_(
                Screening.organization_id == org,
                CarePathway.id.in_(select(Referral.care_pathway_id).where(Referral.destination_org_id == org)),
            ),
        )
    )
    today = local_today()
    rows = []
    for pathway in pathways:
        screening = pathway.screening
        has_access = worker_can_view_patient(db, user, pathway.patient_id, [ConsentScope.screening, ConsentScope.referral])
        referral = care.active_referral(pathway)
        row = {
            "pathway_id": str(pathway.id),
            "screening_id": str(screening.id),
            "patient_code": screening.patient.patient_code,
            "patient_name": screening.patient.user.full_name if has_access else None,
            "access_restricted": not has_access,
            "pathway_type": pathway.pathway_type,
            "outcome_label": OUTCOME_LABELS[pathway.pathway_type],
            "current_stage": pathway.current_stage,
            "released_at": screening.released_at,
            "days_since_result": (today - screening.released_at.date()).days if screening.released_at else None,
            "due_date": pathway.due_date,
            "overdue": pathway.due_date < today,
            "referral": {
                "id": str(referral.id),
                "referral_code": referral.referral_code,
                "status": referral.status,
                "destination": referral.destination_org.name,
                "appointment_at": referral.appointments[-1].scheduled_for if referral.appointments else None,
            } if referral else None,
            "role": "screening_site" if screening.organization_id == org else "receiving_facility",
            "continuity": continuity_dict(continuity.assess(db, pathway)) if has_access else None,
        }
        rows.append(row)
    rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    rows.sort(key=lambda r: (rank.get((r["continuity"] or {}).get("risk_level"), 3), -((r["continuity"] or {}).get("score") or 0)))
    return rows


@router.get("/patients/lookup", summary="Find a patient by KAIA patient code (walk-in registration)")
def lookup_patient(code: str = Query(min_length=4, max_length=32), user: User = WorkerUser, db: Session = Depends(get_db)):
    patient = db.scalar(select(PatientProfile).where(PatientProfile.patient_code == normalize_code(code)))
    if patient is None:
        raise not_found("Patient")
    has_access = worker_can_view_patient(db, user, patient.id, [ConsentScope.screening])
    in_progress = db.scalar(select(Screening.id).where(Screening.patient_id == patient.id, Screening.status.in_(list(IN_PROGRESS))))
    return {
        "patient_code": patient.patient_code,
        "has_consent": has_access,
        "name": patient.user.full_name if has_access else None,
        "age_bracket": patient.age_bracket if has_access else None,
        "has_screening_in_progress": in_progress is not None,
    }
