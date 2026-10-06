import asyncio
import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import reader_dict
from app.core.deps import AnyUser, SystemAdminUser, WorkerUser, require_roles, user_from_token
from app.core.errors import conflict, forbidden, not_found
from app.db.session import SessionLocal, get_db
from app.models import Organization, Reader, Screening, User
from app.models.enums import ReaderStatus, Role
from app.schemas.inputs import ReaderCreateIn, ReaderUpdateIn, StartAnalysisIn
from app.services import analysis, audit
from app.services.access import ensure_screening_access
from app.services.events import reader_events

router = APIRouter(tags=["KAIA Reader"])

STAGE_LIST = [{"stage": i, "key": k, "label": label} for i, (k, label) in enumerate(analysis.STAGES, start=1)]


def load_reader(db: Session, reader_id: str) -> Reader:
    try:
        reader = db.get(Reader, uuid.UUID(reader_id))
    except ValueError:
        reader = db.scalar(select(Reader).where(Reader.reader_code == reader_id.upper()))
    if reader is None:
        raise not_found("Reader")
    return reader


def ensure_reader_scope(user: User, reader: Reader) -> None:
    if user.role == Role.system_admin:
        return
    if user.role in (Role.health_worker, Role.institution_admin) and user.organization_id == reader.organization_id:
        return
    raise forbidden("This reader belongs to another organization")


@router.get("/readers", summary="List KAIA Readers (own organization; all for system admin)")
def list_readers(
    organization_id: uuid.UUID | None = None,
    user: User = Depends(require_roles(Role.health_worker, Role.institution_admin, Role.system_admin)),
    db: Session = Depends(get_db),
):
    query = select(Reader).order_by(Reader.reader_code)
    if user.role != Role.system_admin:
        query = query.where(Reader.organization_id == user.organization_id)
    elif organization_id:
        query = query.where(Reader.organization_id == organization_id)
    return [reader_dict(r, db) for r in db.scalars(query)]


@router.get("/readers/{reader_id}", summary="Reader detail")
def get_reader(reader_id: str, user: User = AnyUser, db: Session = Depends(get_db)):
    reader = load_reader(db, reader_id)
    ensure_reader_scope(user, reader)
    return {**reader_dict(reader, db), "stages": STAGE_LIST}


@router.get("/readers/{reader_id}/status", summary="Live reader status (polling fallback for the WebSocket)")
def reader_status(reader_id: str, user: User = AnyUser, db: Session = Depends(get_db)):
    reader = load_reader(db, reader_id)
    ensure_reader_scope(user, reader)
    return {**reader_dict(reader, db), "stages": STAGE_LIST, "last_event": reader_events.last_event(reader.reader_code)}


@router.post("/readers/{reader_id}/start-analysis", status_code=202, summary="Begin KAIA Reader analysis of an inserted cartridge")
def start_analysis(
    reader_id: str,
    body: StartAnalysisIn,
    request: Request,
    background: BackgroundTasks,
    user: User = WorkerUser,
    db: Session = Depends(get_db),
):
    reader = load_reader(db, reader_id)
    ensure_reader_scope(user, reader)
    screening = db.get(Screening, body.screening_id)
    if screening is None:
        raise not_found("Screening")
    ensure_screening_access(db, user, screening)
    analysis.begin(db, reader, screening)
    audit.record(db, user, "reader.analysis_started", "screening", screening.id, patient_id=screening.patient_id,
                 request=request, detail={"reader": reader.reader_code})
    db.commit()
    reader_events.publish(reader.reader_code, {"type": "analysis_started", "screening_id": str(screening.id),
                                               "total": len(analysis.STAGES)})
    background.add_task(analysis.run, screening.id, reader.reader_code)
    return {"started": True, "screening_id": str(screening.id), "reader_code": reader.reader_code, "stages": STAGE_LIST}


@router.post("/readers/{reader_id}/calibrate", summary="Run reader calibration")
def calibrate(
    reader_id: str,
    request: Request,
    user: User = Depends(require_roles(Role.health_worker, Role.institution_admin, Role.system_admin)),
    db: Session = Depends(get_db),
):
    reader = load_reader(db, reader_id)
    ensure_reader_scope(user, reader)
    if reader.status == ReaderStatus.analyzing:
        raise conflict("Cannot calibrate while an analysis is running")
    reader.last_calibration = date.today()
    reader.temperature_c = 24.0
    reader.last_heartbeat_at = datetime.now(UTC)
    audit.record(db, user, "reader.calibrated", "reader", reader.id, request=request)
    db.commit()
    return reader_dict(reader, db)


@router.post("/readers", status_code=201, summary="Register a new KAIA Reader (system admin)")
def create_reader(body: ReaderCreateIn, request: Request, user: User = SystemAdminUser, db: Session = Depends(get_db)):
    if db.get(Organization, body.organization_id) is None:
        raise not_found("Organization")
    if db.scalar(select(Reader).where(Reader.reader_code == body.reader_code.upper())):
        raise conflict("Reader code already exists")
    reader = Reader(reader_code=body.reader_code.upper(), serial_number=body.serial_number.upper(),
                    organization_id=body.organization_id, location_name=body.location_name,
                    firmware_version=body.firmware_version, status=ReaderStatus.offline,
                    last_calibration=date.today(), temperature_c=24.0)
    db.add(reader)
    db.flush()
    audit.record(db, user, "reader.create", "reader", reader.id, request=request)
    db.commit()
    return reader_dict(reader, db)


@router.patch("/readers/{reader_id}", summary="Update reader (status / location / firmware)")
def update_reader(
    reader_id: str,
    body: ReaderUpdateIn,
    request: Request,
    user: User = Depends(require_roles(Role.institution_admin, Role.system_admin)),
    db: Session = Depends(get_db),
):
    reader = load_reader(db, reader_id)
    ensure_reader_scope(user, reader)
    changes = body.model_dump(exclude_unset=True)
    if user.role != Role.system_admin and set(changes) - {"status", "location_name"}:
        raise forbidden("Institution admins can only change reader status and location")
    if reader.status == ReaderStatus.analyzing and "status" in changes:
        raise conflict("Reader is analyzing")
    for key, value in changes.items():
        setattr(reader, key, value)
    audit.record(db, user, "reader.update", "reader", reader.id, request=request, detail={"fields": sorted(changes)})
    db.commit()
    return reader_dict(reader, db)


async def _wait_disconnect(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return


@router.websocket("/ws/readers/{reader_code}")
async def reader_socket(websocket: WebSocket, reader_code: str):
    """Live reader events. Client must send {"token": "<access token>"} as the first message."""
    await websocket.accept()
    try:
        message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        token = message.get("token") if isinstance(message, dict) else None
        if not token:
            raise ValueError("missing token")
        with SessionLocal() as db:
            user = user_from_token(db, token)
            reader = db.scalar(select(Reader).where(Reader.reader_code == reader_code.upper()))
            if reader is None:
                await websocket.close(code=4404)
                return
            ensure_reader_scope(user, reader)
            code = reader.reader_code
    except (HTTPException, ValueError, asyncio.TimeoutError, WebSocketDisconnect):
        try:
            await websocket.close(code=4401)
        except RuntimeError:
            pass
        return

    await websocket.send_json({"type": "subscribed", "reader_code": code, "last_event": reader_events.last_event(code)})
    disconnect = asyncio.create_task(_wait_disconnect(websocket))
    with reader_events.subscribe(code) as queue:
        try:
            while True:
                getter = asyncio.create_task(queue.get())
                done, _ = await asyncio.wait({getter, disconnect}, return_when=asyncio.FIRST_COMPLETED)
                if disconnect in done:
                    getter.cancel()
                    break
                await websocket.send_json(getter.result())
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            disconnect.cancel()
