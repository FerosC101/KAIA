import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import OUTCOME_LABELS, inventory_dict, org_ref, temperature_label
from app.core.deps import require_roles
from app.core.errors import conflict, not_found
from app.core.security import hash_password
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models import (
    CarePathway,
    HealthWorker,
    InventoryBatch,
    Organization,
    Reader,
    Referral,
    Screening,
    User,
)
from app.models.enums import PathwayStatus, ReferralStatus, Role, ScreeningOutcome, ScreeningStatus
from app.schemas.inputs import StaffCreateIn, StaffUpdateIn
from app.services import analytics, audit, care, continuity
from app.services.access import ensure_org_scope
from app.services.common import unique_code

router = APIRouter(prefix="/organizations", tags=["KAIA Population"])

AnalyticsUser = Depends(require_roles(Role.institution_admin, Role.system_admin))
PRIVACY_NOTE = "Aggregated, de-identified program data. No personally identifiable information is displayed."


def load_org(db: Session, user: User, organization_id: uuid.UUID) -> Organization:
    org = db.get(Organization, organization_id)
    if org is None:
        raise not_found("Organization")
    ensure_org_scope(user, org.id)
    return org


@router.get("", summary="Organizations visible to me")
def list_orgs(user: User = AnalyticsUser, db: Session = Depends(get_db)):
    query = select(Organization).order_by(Organization.name)
    if user.role != Role.system_admin:
        query = query.where(Organization.id == user.organization_id)
    return [org_ref(o) for o in db.scalars(query)]


@router.get("/{organization_id}/analytics", summary="Program analytics (aggregate)")
def org_analytics(organization_id: uuid.UUID, request: Request, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    data = analytics.collect(db, org.id)
    audit.record(db, user, "analytics.view", "organization", org.id, request=request)
    db.commit()
    return {
        "organization": org_ref(org),
        "summary": analytics.summary(data),
        "barangays": analytics.barangay_breakdown(data),
        "monthly": analytics.monthly(data),
        "generated_at": datetime.now(UTC),
        "privacy_note": PRIVACY_NOTE,
    }


@router.get("/{organization_id}/screening-funnel", summary="Screening → follow-up funnel")
def screening_funnel(organization_id: uuid.UUID, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    return {"organization": org_ref(org), "funnel": analytics.funnel(analytics.collect(db, org.id)), "privacy_note": PRIVACY_NOTE}


@router.get("/{organization_id}/care-gaps", summary="Program gap detection — where the care pathway is failing")
def care_gaps(organization_id: uuid.UUID, request: Request, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    audit.record(db, user, "analytics.care_gaps_view", "organization", org.id, request=request)
    db.commit()
    return {"organization": org_ref(org), **analytics.care_gaps(analytics.collect(db, org.id)), "privacy_note": PRIVACY_NOTE}


@router.get("/{organization_id}/overview", summary="Institution dashboard overview")
def overview(organization_id: uuid.UUID, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    data = analytics.collect(db, org.id)
    today = local_today()
    month_start = datetime(today.year, today.month, 1, tzinfo=UTC)

    def screening_count(*conditions) -> int:
        return db.scalar(select(func.count(Screening.id)).where(Screening.organization_id == org.id, *conditions)) or 0

    referral_counts = dict(
        db.execute(
            select(Referral.status, func.count(Referral.id)).where(Referral.source_org_id == org.id).group_by(Referral.status)
        ).all()
    )
    active_pathways = list(db.scalars(
        select(CarePathway).join(Screening, Screening.id == CarePathway.screening_id).where(
            Screening.organization_id == org.id, CarePathway.status == PathwayStatus.active,
            CarePathway.pathway_type != ScreeningOutcome.routine_screening)
    ))
    risk_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for pathway in active_pathways:
        risk_counts[continuity.assess(db, pathway).risk_level] += 1

    readers = list(db.scalars(select(Reader).where(Reader.organization_id == org.id).order_by(Reader.reader_code)))
    batches = list(db.scalars(select(InventoryBatch).where(InventoryBatch.organization_id == org.id)))
    inventory_alerts = [
        b for b in (inventory_dict(x, today) for x in batches)
        if b["status"] not in ("depleted",) and (b["low_stock"] or b["expiring_soon"] or b["expired"])
    ]
    return {
        "organization": org_ref(org),
        "summary": analytics.summary(data),
        "screening_stats": {
            "platform_screenings": screening_count(),
            "this_month": screening_count(Screening.registered_at >= month_start),
            "pending_review": screening_count(Screening.status == ScreeningStatus.pending_review),
            "in_progress": screening_count(Screening.status.in_([ScreeningStatus.kit_registered, ScreeningStatus.sample_collected,
                                                                  ScreeningStatus.cartridge_registered, ScreeningStatus.analyzing])),
        },
        "referral_status_counts": {s.value: referral_counts.get(s.value, 0) for s in ReferralStatus},
        "continuity_risk": risk_counts,
        "devices": [
            {
                "id": str(r.id),
                "reader_code": r.reader_code,
                "location_name": r.location_name,
                "status": r.status,
                "firmware_version": r.firmware_version,
                "temperature_label": temperature_label(r.temperature_c),
                "last_calibration": r.last_calibration,
                "calibration_due": (today - r.last_calibration).days > 30,
                "last_heartbeat_at": r.last_heartbeat_at,
                "total_analyses": r.total_analyses,
            }
            for r in readers
        ],
        "inventory_alerts": inventory_alerts,
        "staff_count": db.scalar(select(func.count(HealthWorker.id)).where(
            HealthWorker.organization_id == org.id, HealthWorker.active.is_(True))) or 0,
        "privacy_note": PRIVACY_NOTE,
    }


@router.get("/{organization_id}/unresolved-follow-ups", summary="Unresolved follow-ups (pseudonymous) with continuity risk")
def unresolved_follow_ups(organization_id: uuid.UUID, request: Request, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    today = local_today()
    rows = []
    pathways = db.scalars(
        select(CarePathway).join(Screening, Screening.id == CarePathway.screening_id).where(
            Screening.organization_id == org.id, CarePathway.status == PathwayStatus.active,
            CarePathway.pathway_type != ScreeningOutcome.routine_screening)
    )
    for pathway in pathways:
        screening = pathway.screening
        referral = care.active_referral(pathway)
        prediction = continuity.assess(db, pathway)
        rows.append({
            "pathway_id": str(pathway.id),
            "patient_code": screening.patient.patient_code,  # pseudonymous — no names for admins
            "barangay": screening.barangay.name if screening.barangay else None,
            "pathway_type": pathway.pathway_type,
            "outcome_label": OUTCOME_LABELS[pathway.pathway_type],
            "current_stage": pathway.current_stage,
            "days_since_result": (today - screening.released_at.date()).days,
            "due_date": pathway.due_date,
            "overdue": pathway.due_date < today,
            "referral_status": referral.status if referral else None,
            "destination": referral.destination_org.name if referral else None,
            "continuity": {
                "risk_level": prediction.risk_level,
                "score": prediction.score,
                "reason": prediction.reason,
                "recommended_intervention": prediction.recommended_intervention,
            },
        })
    rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    rows.sort(key=lambda r: (rank[r["continuity"]["risk_level"]], -r["continuity"]["score"]))
    summary = analytics.summary(analytics.collect(db, org.id))
    audit.record(db, user, "analytics.unresolved_view", "organization", org.id, request=request)
    db.commit()
    return {
        "items": rows,
        "platform_tracked": len(rows),
        "historical_unresolved": max(0, summary["unresolved"] - len(rows)),
        "model_version": continuity.MODEL_VERSION,
        "note": "Patient codes are pseudonymous. Identities are visible only to consented care teams.",
    }


@router.get("/{organization_id}/reports/aggregate.csv", summary="Export aggregate report (small cells suppressed)")
def export_report(organization_id: uuid.UUID, request: Request, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    csv_body = analytics.export_csv(analytics.collect(db, org.id))
    audit.record(db, user, "analytics.export", "organization", org.id, request=request, detail={"format": "csv"})
    db.commit()
    filename = f"kaia-{org.code.lower()}-aggregate-{local_today().isoformat()}.csv"
    return Response(content=csv_body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# --- staff management ----------------------------------------------------------


@router.get("/{organization_id}/staff", tags=["Institution Admin"], summary="Health workers at my organization")
def list_staff(organization_id: uuid.UUID, user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    workers = db.scalars(select(HealthWorker).where(HealthWorker.organization_id == org.id).order_by(HealthWorker.created_at))
    return [
        {
            "id": str(w.id),
            "name": w.user.full_name,
            "email": w.user.email,
            "position": w.position,
            "employee_code": w.employee_code,
            "active": w.active and w.user.is_active,
            "last_login_at": w.user.last_login_at,
            "screenings_reviewed": db.scalar(select(func.count(Screening.id)).where(Screening.reviewed_by_id == w.user_id)) or 0,
        }
        for w in workers
    ]


@router.post("/{organization_id}/staff", status_code=201, tags=["Institution Admin"], summary="Add a health worker")
def create_staff(organization_id: uuid.UUID, body: StaffCreateIn, request: Request, user: User = AnalyticsUser,
                 db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise conflict("An account with this email already exists")
    account = User(email=email, full_name=body.full_name, role=Role.health_worker, organization_id=org.id,
                   password_hash=hash_password(body.temporary_password))
    db.add(account)
    db.flush()
    worker = HealthWorker(user_id=account.id, organization_id=org.id, position=body.position,
                          employee_code=unique_code(db, HealthWorker, HealthWorker.employee_code, f"{org.code}-HW-", 3))
    db.add(worker)
    audit.record(db, user, "staff.create", "health_worker", account.id, request=request)
    db.commit()
    return {"id": str(worker.id), "employee_code": worker.employee_code, "email": email}


@router.patch("/{organization_id}/staff/{worker_id}", tags=["Institution Admin"], summary="Activate / deactivate a health worker")
def update_staff(organization_id: uuid.UUID, worker_id: uuid.UUID, body: StaffUpdateIn, request: Request,
                 user: User = AnalyticsUser, db: Session = Depends(get_db)):
    org = load_org(db, user, organization_id)
    worker = db.get(HealthWorker, worker_id)
    if worker is None or worker.organization_id != org.id:
        raise not_found("Health worker")
    if body.position is not None:
        worker.position = body.position
    if body.active is not None:
        worker.active = body.active
        worker.user.is_active = body.active
        if not body.active:
            worker.user.token_version += 1  # revoke sessions immediately
    audit.record(db, user, "staff.update", "health_worker", worker.user_id, request=request,
                 detail=body.model_dump(exclude_unset=True))
    db.commit()
    return {"id": str(worker.id), "active": worker.active, "position": worker.position}
