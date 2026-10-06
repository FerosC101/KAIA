import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import inventory_dict
from app.core.deps import require_roles
from app.core.errors import bad_request, conflict, not_found
from app.core.timeutil import local_today
from app.db.session import get_db
from app.models import Cartridge, InventoryBatch, Kit, Organization, Reader, User
from app.models.enums import InventoryItemType, InventoryStatus, Role
from app.schemas.inputs import InventoryBatchIn, InventoryUpdateIn
from app.services import audit
from app.services.access import ensure_org_scope

router = APIRouter(prefix="/inventory", tags=["Inventory"])

InventoryViewer = Depends(require_roles(Role.health_worker, Role.institution_admin, Role.system_admin))
InventoryManager = Depends(require_roles(Role.institution_admin, Role.system_admin))


def _scoped(query, user: User, organization_id: uuid.UUID | None):
    if user.role != Role.system_admin:
        return query.where(InventoryBatch.organization_id == user.organization_id)
    if organization_id:
        return query.where(InventoryBatch.organization_id == organization_id)
    return query


@router.get("", summary="Inventory batches")
def list_batches(item_type: InventoryItemType | None = None, organization_id: uuid.UUID | None = None,
                 user: User = InventoryViewer, db: Session = Depends(get_db)):
    query = _scoped(select(InventoryBatch), user, organization_id)
    if item_type:
        query = query.where(InventoryBatch.item_type == item_type)
    today = local_today()
    return [inventory_dict(b, today) for b in db.scalars(query.order_by(InventoryBatch.item_type, InventoryBatch.expiry_date))]


@router.get("/alerts", summary="Low-stock and expiry alerts")
def alerts(organization_id: uuid.UUID | None = None, user: User = InventoryViewer, db: Session = Depends(get_db)):
    today = local_today()
    out = []
    for batch in db.scalars(_scoped(select(InventoryBatch), user, organization_id)):
        item = inventory_dict(batch, today)
        if batch.status == InventoryStatus.depleted:
            out.append({**item, "alert": "depleted", "message": f"{batch.batch_number} is depleted"})
        elif item["expired"]:
            out.append({**item, "alert": "expired", "message": f"{batch.batch_number} expired — quarantine remaining units"})
        elif item["low_stock"]:
            out.append({**item, "alert": "low_stock",
                        "message": f"Low stock: {batch.quantity} left (reorder at {batch.reorder_threshold})"})
        elif item["expiring_soon"]:
            out.append({**item, "alert": "expiring_soon", "message": f"Expires in {item['days_to_expiry']} days"})
    return out


@router.get("/summary", summary="Tracked device counts by status")
def summary(organization_id: uuid.UUID | None = None, user: User = InventoryViewer, db: Session = Depends(get_db)):
    org_id = organization_id if user.role == Role.system_admin else user.organization_id

    def by_status(model):
        query = select(model.status, func.count(model.id)).group_by(model.status)
        if org_id:
            query = query.where(model.organization_id == org_id)
        return dict(db.execute(query).all())

    return {"kits": by_status(Kit), "cartridges": by_status(Cartridge), "readers": by_status(Reader)}


@router.post("", status_code=201, summary="Receive a new inventory batch")
def create_batch(body: InventoryBatchIn, request: Request, user: User = InventoryManager, db: Session = Depends(get_db)):
    ensure_org_scope(user, body.organization_id)
    if db.get(Organization, body.organization_id) is None:
        raise not_found("Organization")
    if body.expiry_date <= body.manufacture_date:
        raise bad_request("Expiry date must be after manufacture date")
    if db.scalar(select(InventoryBatch).where(InventoryBatch.batch_number == body.batch_number.upper())):
        raise conflict("Batch number already exists")
    batch = InventoryBatch(**{**body.model_dump(), "batch_number": body.batch_number.upper()}, initial_quantity=body.quantity)
    db.add(batch)
    db.flush()
    audit.record(db, user, "inventory.create", "inventory_batch", batch.id, request=request)
    db.commit()
    return inventory_dict(batch, local_today())


@router.patch("/{batch_id}", summary="Adjust quantity, status or location")
def update_batch(batch_id: uuid.UUID, body: InventoryUpdateIn, request: Request, user: User = InventoryManager,
                 db: Session = Depends(get_db)):
    batch = db.get(InventoryBatch, batch_id)
    if batch is None:
        raise not_found("Inventory batch")
    ensure_org_scope(user, batch.organization_id)
    if body.quantity_delta is not None:
        new_quantity = batch.quantity + body.quantity_delta
        if new_quantity < 0:
            raise bad_request("Quantity cannot go below zero")
        batch.quantity = new_quantity
        if new_quantity == 0:
            batch.status = InventoryStatus.depleted
        elif batch.status == InventoryStatus.depleted:
            batch.status = InventoryStatus.available
    for field in ("status", "location", "reorder_threshold"):
        value = getattr(body, field)
        if value is not None:
            setattr(batch, field, value)
    audit.record(db, user, "inventory.update", "inventory_batch", batch.id, request=request,
                 detail=body.model_dump(exclude_unset=True))
    db.commit()
    return inventory_dict(batch, local_today())
