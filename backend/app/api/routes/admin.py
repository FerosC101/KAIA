import time
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.api.serializers import OUTCOME_LABELS, org_ref, rule_dict, user_dict
from app.core.config import settings
from app.core.deps import SystemAdminUser
from app.core.errors import bad_request, conflict, not_found
from app.core.security import hash_password
from app.db.session import get_db
from app.models import (
    AIAnalysis,
    AuditLog,
    Cartridge,
    HealthWorker,
    InventoryBatch,
    ModelVersion,
    Organization,
    PathwayConfig,
    Reader,
    RiskRule,
    Screening,
    User,
)
from app.models.enums import CartridgeStatus, InventoryItemType, ModelStatus, ReaderStatus, Role
from app.schemas.inputs import (
    CartridgeGenerateIn,
    ModelVersionIn,
    OrganizationIn,
    OrganizationUpdateIn,
    PathwayConfigUpdateIn,
    RiskRuleIn,
    RiskRuleUpdateIn,
    RiskTestIn,
    UserCreateIn,
    UserUpdateIn,
)
from app.services import audit, risk_engine
from app.services.common import unique_code
from app.services.events import reader_events

router = APIRouter(prefix="/admin", tags=["KAIA System Admin"])

STARTED_AT = time.monotonic()


# --- organizations -----------------------------------------------------------


@router.get("/organizations")
def list_organizations(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    out = []
    for org in db.scalars(select(Organization).order_by(Organization.name)):
        out.append({
            **org_ref(org),
            "code": org.code,
            "city": org.city,
            "province": org.province,
            "address": org.address,
            "phone": org.phone,
            "operating_hours": org.operating_hours,
            "services": org.services,
            "is_referral_partner": org.is_referral_partner,
            "active": org.active,
            "health_workers": db.scalar(select(func.count(HealthWorker.id)).where(HealthWorker.organization_id == org.id)) or 0,
            "readers": db.scalar(select(func.count(Reader.id)).where(Reader.organization_id == org.id)) or 0,
            "screenings": db.scalar(select(func.count(Screening.id)).where(Screening.organization_id == org.id)) or 0,
        })
    return out


@router.post("/organizations", status_code=201)
def create_organization(body: OrganizationIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    if db.scalar(select(Organization).where(or_(Organization.name == body.name, Organization.code == body.code.upper()))):
        raise conflict("An organization with this name or code already exists")
    org = Organization(**{**body.model_dump(), "code": body.code.upper()})
    db.add(org)
    db.flush()
    audit.record(db, user, "organization.create", "organization", org.id, request=request)
    db.commit()
    return org_ref(org)


@router.patch("/organizations/{organization_id}")
def update_organization(organization_id: uuid.UUID, body: OrganizationUpdateIn, request: Request,
                        user: User = SystemAdminUser, db: Session = Depends(get_db)):
    org = db.get(Organization, organization_id)
    if org is None:
        raise not_found("Organization")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(org, key, value)
    audit.record(db, user, "organization.update", "organization", org.id, request=request, detail={"fields": sorted(changes)})
    db.commit()
    return org_ref(org)


# --- users ----------------------------------------------------------------------


@router.get("/users")
def list_users(role: Role | None = None, q: str | None = Query(default=None, max_length=80),
               user: User = SystemAdminUser, db: Session = Depends(get_db)):
    query = select(User).order_by(User.role, User.created_at)
    if role:
        query = query.where(User.role == role)
    if q:
        query = query.where(User.email.ilike(f"%{q.strip().lower()}%"))
    return [user_dict(u) for u in db.scalars(query.limit(300))]


@router.post("/users", status_code=201)
def create_user(body: UserCreateIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise conflict("An account with this email already exists")
    if body.role in (Role.health_worker, Role.institution_admin):
        if body.organization_id is None or db.get(Organization, body.organization_id) is None:
            raise bad_request("Health workers and institution admins must belong to an organization")
    account = User(email=email, full_name=body.full_name, role=body.role, organization_id=body.organization_id,
                   password_hash=hash_password(body.temporary_password))
    db.add(account)
    db.flush()
    if body.role == Role.health_worker:
        org = db.get(Organization, body.organization_id)
        db.add(HealthWorker(user_id=account.id, organization_id=org.id, position=body.position or "Health worker",
                            employee_code=unique_code(db, HealthWorker, HealthWorker.employee_code, f"{org.code}-HW-", 3)))
    audit.record(db, user, "user.create", "user", account.id, request=request, detail={"role": body.role})
    db.commit()
    return user_dict(account)


@router.patch("/users/{user_id}")
def update_user(user_id: uuid.UUID, body: UserUpdateIn, request: Request, user: User = SystemAdminUser,
                db: Session = Depends(get_db)):
    account = db.get(User, user_id)
    if account is None:
        raise not_found("User")
    if account.id == user.id and body.is_active is False:
        raise bad_request("You cannot deactivate your own account")
    if body.is_active is not None:
        account.is_active = body.is_active
        if not body.is_active:
            account.token_version += 1
    if body.organization_id is not None:
        if account.role == Role.patient:
            raise bad_request("Patients are not assigned to organizations")
        if db.get(Organization, body.organization_id) is None:
            raise not_found("Organization")
        account.organization_id = body.organization_id
        if account.health_worker:
            account.health_worker.organization_id = body.organization_id
    audit.record(db, user, "user.update", "user", account.id, request=request, detail=body.model_dump(exclude_unset=True, mode="json"))
    db.commit()
    return user_dict(account)


# --- cartridges -------------------------------------------------------------------


@router.get("/cartridges")
def list_cartridges(status: CartridgeStatus | None = None, organization_id: uuid.UUID | None = None,
                    page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                    user: User = SystemAdminUser, db: Session = Depends(get_db)):
    query = select(Cartridge)
    if status:
        query = query.where(Cartridge.status == status)
    if organization_id:
        query = query.where(Cartridge.organization_id == organization_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orgs = {o.id: o for o in db.scalars(select(Organization))}
    items = db.scalars(query.order_by(Cartridge.created_at.desc(), Cartridge.cartridge_code).offset((page - 1) * page_size).limit(page_size))
    counts = dict(db.execute(select(Cartridge.status, func.count(Cartridge.id)).group_by(Cartridge.status)).all())
    return {
        "total": total,
        "status_counts": counts,
        "items": [
            {"id": str(c.id), "cartridge_code": c.cartridge_code, "status": c.status, "lot_expiry": c.lot_expiry,
             "organization": org_ref(orgs.get(c.organization_id)), "sim_profile": c.sim_profile}
            for c in items
        ],
    }


@router.post("/cartridges/generate", status_code=201, summary="Provision a new cartridge lot")
def generate_cartridges(body: CartridgeGenerateIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    org = db.get(Organization, body.organization_id)
    if org is None:
        raise not_found("Organization")
    if body.lot_expiry <= date.today():
        raise bad_request("Lot expiry must be in the future")
    batch = InventoryBatch(
        organization_id=org.id, item_type=InventoryItemType.cartridge,
        batch_number=unique_code(db, InventoryBatch, InventoryBatch.batch_number, f"CB-{date.today():%Y%m}-", 3),
        manufacture_date=date.today(), expiry_date=body.lot_expiry, initial_quantity=body.count, quantity=body.count,
        reorder_threshold=max(10, body.count // 5), location=org.name,
    )
    db.add(batch)
    db.flush()
    codes = []
    for _ in range(body.count):
        code = unique_code(db, Cartridge, Cartridge.cartridge_code, "KAIA-CAR-", 5)
        db.add(Cartridge(cartridge_code=code, batch_id=batch.id, organization_id=org.id, lot_expiry=body.lot_expiry))
        db.flush()
        codes.append(code)
    audit.record(db, user, "cartridge.provision", "inventory_batch", batch.id, request=request, detail={"count": body.count})
    db.commit()
    return {"batch_number": batch.batch_number, "count": len(codes), "codes": codes[:20]}


# --- model versions -------------------------------------------------------------------


def _model_dict(m: ModelVersion) -> dict:
    return {"id": str(m.id), "name": m.name, "model_type": m.model_type, "version": m.version, "status": m.status,
            "description": m.description, "metrics": m.metrics, "released_at": m.released_at, "activated_at": m.activated_at}


@router.get("/model-versions")
def list_models(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    models = db.scalars(select(ModelVersion).order_by(ModelVersion.model_type, ModelVersion.released_at.desc()))
    usage = dict(db.execute(select(AIAnalysis.model_version, func.count(AIAnalysis.id)).group_by(AIAnalysis.model_version)).all())
    return [{**_model_dict(m), "analyses": usage.get(m.version, 0)} for m in models]


@router.post("/model-versions", status_code=201)
def register_model(body: ModelVersionIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    model = ModelVersion(**body.model_dump(), released_at=date.today())
    db.add(model)
    db.flush()
    audit.record(db, user, "model.register", "model_version", model.id, request=request)
    db.commit()
    return _model_dict(model)


@router.post("/model-versions/{model_id}/activate", summary="Promote a model version to active (previous active is retired)")
def activate_model(model_id: uuid.UUID, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    model = db.get(ModelVersion, model_id)
    if model is None:
        raise not_found("Model version")
    for other in db.scalars(select(ModelVersion).where(ModelVersion.model_type == model.model_type,
                                                       ModelVersion.status == ModelStatus.active)):
        other.status = ModelStatus.retired
    model.status = ModelStatus.active
    model.activated_at = datetime.now(UTC)
    audit.record(db, user, "model.activate", "model_version", model.id, request=request,
                 detail={"type": model.model_type, "version": model.version})
    db.commit()
    return _model_dict(model)


@router.post("/model-versions/{model_id}/status", summary="Set a model to shadow or retired")
def set_model_status(model_id: uuid.UUID, status: ModelStatus, request: Request, user: User = SystemAdminUser,
                     db: Session = Depends(get_db)):
    model = db.get(ModelVersion, model_id)
    if model is None:
        raise not_found("Model version")
    if status == ModelStatus.active:
        return activate_model(model_id, request, user, db)
    model.status = status
    audit.record(db, user, "model.status", "model_version", model.id, request=request, detail={"status": status})
    db.commit()
    return _model_dict(model)


# --- risk rules & pathways ---------------------------------------------------------------


@router.get("/risk-rules")
def list_rules(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    rules = db.scalars(select(RiskRule).order_by(RiskRule.priority))
    return {
        "label": risk_engine.DECISION_LABEL,
        "engine_version": risk_engine.RULES_ENGINE_VERSION,
        "rules": [rule_dict(r) for r in rules],
        "fields": risk_engine.RULE_FIELDS,
        "operators": risk_engine.OPERATORS,
        "outcomes": [{"value": k, "label": v} for k, v in OUTCOME_LABELS.items()],
        "model_escalation_threshold": risk_engine.MODEL_ESCALATION_THRESHOLD,
    }


def _validated_conditions(conditions) -> dict:
    data = conditions.model_dump()
    try:
        risk_engine.validate_conditions(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    return data


@router.post("/risk-rules", status_code=201)
def create_rule(body: RiskRuleIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    rule = RiskRule(pathway_key=risk_engine.PATHWAY_KEY, name=body.name, description=body.description,
                    priority=body.priority, conditions=_validated_conditions(body.conditions), outcome=body.outcome,
                    active=body.active, updated_by_id=user.id)
    db.add(rule)
    db.flush()
    audit.record(db, user, "risk_rule.create", "risk_rule", rule.id, request=request)
    db.commit()
    return rule_dict(rule)


@router.patch("/risk-rules/{rule_id}")
def update_rule(rule_id: uuid.UUID, body: RiskRuleUpdateIn, request: Request, user: User = SystemAdminUser,
                db: Session = Depends(get_db)):
    rule = db.get(RiskRule, rule_id)
    if rule is None:
        raise not_found("Rule")
    changes = body.model_dump(exclude_unset=True)
    if body.conditions is not None:
        rule.conditions = _validated_conditions(body.conditions)
    for key in ("name", "description", "priority", "outcome", "active"):
        if key in changes:
            setattr(rule, key, changes[key])
    rule.updated_by_id = user.id
    if db.scalar(select(func.count(RiskRule.id)).where(RiskRule.active.is_(True))) == 0 and not rule.active:
        raise bad_request("At least one rule must remain active")
    audit.record(db, user, "risk_rule.update", "risk_rule", rule.id, request=request, detail={"fields": sorted(changes)})
    db.commit()
    return rule_dict(rule)


@router.delete("/risk-rules/{rule_id}", status_code=204)
def delete_rule(rule_id: uuid.UUID, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    rule = db.get(RiskRule, rule_id)
    if rule is None:
        raise not_found("Rule")
    db.delete(rule)
    audit.record(db, user, "risk_rule.delete", "risk_rule", rule_id, request=request, detail={"name": rule.name})
    db.commit()


@router.post("/risk-rules/test", summary="Dry-run the Risk Engine against a hypothetical assay")
def test_rules(body: RiskTestIn, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    decision = risk_engine.evaluate(db, risk_engine.RiskInput(**body.model_dump()))
    return {"outcome": decision.outcome, "outcome_label": OUTCOME_LABELS[decision.outcome], "trace": decision.trace}


@router.get("/pathways")
def list_pathways(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    return [
        {"id": str(p.id), "pathway_key": p.pathway_key, "outcome": p.outcome, "outcome_label": OUTCOME_LABELS[p.outcome],
         "recommended_action": p.recommended_action, "referral_type": p.referral_type, "timeframe_days": p.timeframe_days,
         "patient_message": p.patient_message, "next_step_message": p.next_step_message, "required_service": p.required_service}
        for p in db.scalars(select(PathwayConfig).order_by(PathwayConfig.timeframe_days.desc()))
    ]


@router.patch("/pathways/{pathway_id}")
def update_pathway(pathway_id: uuid.UUID, body: PathwayConfigUpdateIn, request: Request, user: User = SystemAdminUser,
                   db: Session = Depends(get_db)):
    config = db.get(PathwayConfig, pathway_id)
    if config is None:
        raise not_found("Pathway configuration")
    changes = body.model_dump(exclude_unset=True)
    lowered = " ".join(str(v).lower() for v in changes.values())
    if "diagnos" in lowered and "not a" not in lowered:
        raise bad_request("Patient messaging must not present results as a diagnosis")
    for key, value in changes.items():
        setattr(config, key, value)
    audit.record(db, user, "pathway.update", "pathway_config", config.id, request=request, detail={"fields": sorted(changes)})
    db.commit()
    return list_pathways(user, db)


# --- system health & demo ------------------------------------------------------------------


@router.get("/system-health")
def system_health(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    t0 = time.perf_counter()
    db.execute(text("SELECT 1"))
    db_latency = round((time.perf_counter() - t0) * 1000, 1)
    active = {m.model_type: f"{m.name} {m.version}" for m in db.scalars(select(ModelVersion).where(ModelVersion.status == ModelStatus.active))}
    readers = list(db.scalars(select(Reader).order_by(Reader.reader_code)))
    since = datetime.now(UTC) - timedelta(hours=24)
    roles = dict(db.execute(select(User.role, func.count(User.id)).group_by(User.role)).all())
    online = sum(1 for r in readers if r.status in (ReaderStatus.online, ReaderStatus.analyzing))
    checks = [
        {"name": "PostgreSQL", "status": "ok", "detail": f"{db_latency} ms round-trip"},
        {"name": "KAIA Vision service", "status": "ok" if "vision" in active else "degraded", "detail": active.get("vision", "No active model")},
        {"name": "KAIA Risk Engine", "status": "ok",
         "detail": f"{db.scalar(select(func.count(RiskRule.id)).where(RiskRule.active.is_(True)))} active rules · {active.get('risk', 'rules only')}"},
        {"name": "KAIA Continuity Engine", "status": "ok" if "continuity" in active else "degraded", "detail": active.get("continuity", "No active model")},
        {"name": "Reader gateway", "status": "ok" if online else "degraded", "detail": f"Simulated · {online}/{len(readers)} readers online"},
        {"name": "Object storage", "status": "ok", "detail": f"{settings.storage_backend} · signed URLs ({settings.file_url_ttl_seconds}s TTL)"},
        {"name": "Live reader channel", "status": "ok", "detail": f"WebSocket · {reader_events.connection_count} open connection(s)"},
    ]
    return {
        "status": "operational" if all(c["status"] == "ok" for c in checks) else "degraded",
        "environment": settings.environment,
        "version": "1.0.0",
        "uptime_seconds": int(time.monotonic() - STARTED_AT),
        "checks": checks,
        "counts": {
            "users_by_role": roles,
            "organizations": db.scalar(select(func.count(Organization.id))),
            "screenings": db.scalar(select(func.count(Screening.id))),
            "analyses_24h": db.scalar(select(func.count(AIAnalysis.id)).where(AIAnalysis.created_at >= since)),
            "audit_events_24h": db.scalar(select(func.count(AuditLog.id)).where(AuditLog.timestamp >= since)),
        },
        "readers": [{"reader_code": r.reader_code, "status": r.status, "organization": r.organization.name,
                     "last_heartbeat_at": r.last_heartbeat_at, "firmware_version": r.firmware_version} for r in readers],
    }


@router.post("/demo/reset", summary="Reset all data to the synthetic demo state (prototype only)")
def reset_demo(user: User = SystemAdminUser, db: Session = Depends(get_db)):
    if not settings.enable_demo_endpoints or settings.is_production:
        raise HTTPException(404, "Not found")
    from app.seed import seed_database

    stats = seed_database(db, reset=True)
    return {"reset": True, **stats}
