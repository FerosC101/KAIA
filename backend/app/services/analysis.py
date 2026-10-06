"""Reader analysis orchestrator.

Runs the seven KAIA Reader stages, persisting progress and publishing live events. Each stage
calls into the hardware gateway, KAIA Vision, or the Risk Engine through their interfaces.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import conflict
from app.db.session import SessionLocal
from app.models import AIAnalysis, AssayResult, Reader, Screening, User
from app.models.enums import CartridgeStatus, ModelType, ReaderStatus, ScreeningOutcome, ScreeningStatus
from app.services import risk_engine
from app.services.common import notify, upsert_passport_event
from app.services.events import reader_events
from app.services.reader.base import AssayCapture, get_reader_gateway
from app.services.storage import get_storage
from app.services.vision.base import VisionResult, get_vision_model

log = logging.getLogger("kaia.analysis")

STAGES = [
    ("cartridge_verification", "Cartridge verification"),
    ("sample_quality", "Sample quality check"),
    ("assay_processing", "Assay processing"),
    ("image_capture", "Image capture"),
    ("vision_analysis", "KAIA Vision analysis"),
    ("risk_engine", "Risk engine processing"),
    ("result_generated", "Result generated"),
]

_captures: dict[uuid.UUID, AssayCapture] = {}


def begin(db: Session, reader: Reader, screening: Screening) -> None:
    if screening.status != ScreeningStatus.cartridge_registered:
        raise conflict("Screening is not ready for analysis")
    if screening.reader_id != reader.id or reader.current_cartridge_id != screening.cartridge_id:
        raise conflict("The screening's cartridge is not inserted in this reader")
    if reader.status != ReaderStatus.online:
        raise conflict(f"{reader.reader_code} is {reader.status}")
    screening.status = ScreeningStatus.analyzing
    screening.analysis_stage = 0
    screening.analysis_started_at = datetime.now(UTC)
    reader.status = ReaderStatus.analyzing
    reader.last_heartbeat_at = datetime.now(UTC)


def run_vision(db: Session, assay: AssayResult | None, screening: Screening, capture: AssayCapture) -> tuple[AssayResult, VisionResult]:
    model_row = risk_engine.active_model(db, ModelType.vision)
    model = get_vision_model(model_row.version if model_row else None)
    result = model.analyze(capture)
    if assay is None:
        image_path = f"assays/{screening.id.hex}.svg"
        get_storage().save(image_path, capture.image_bytes, capture.content_type)
        assay = AssayResult(screening_id=screening.id, reader_id=screening.reader_id, image_path=image_path,
                            captured_at=datetime.now(UTC), control_valid=result.control_valid,
                            hpv_signal=result.hpv_signal, hpv_genotype=result.hpv_genotype,
                            secondary_marker=result.secondary_marker, sample_quality=result.sample_quality,
                            assay_confidence=result.assay_confidence)
        db.add(assay)
        db.flush()
    else:
        assay.control_valid = result.control_valid
        assay.hpv_signal = result.hpv_signal
        assay.hpv_genotype = result.hpv_genotype
        assay.secondary_marker = result.secondary_marker
        assay.sample_quality = result.sample_quality
        assay.assay_confidence = result.assay_confidence
    db.add(AIAnalysis(
        assay_result_id=assay.id,
        model_version_id=model_row.id if model_row else None,
        model_version=result.model_version,
        analysis_type="vision",
        image_url=assay.image_path,
        regions=result.regions,
        signal_intensity=result.signal_intensity,
        control_validity=result.control_valid,
        prediction=result.prediction,
        confidence=result.assay_confidence,
        confidence_score=result.confidence_score,
        pipeline=result.pipeline,
    ))
    return assay, result


def _execute_stage(screening_id: uuid.UUID, index: int, key: str) -> dict:
    gateway = get_reader_gateway()
    with SessionLocal() as db:
        screening = db.get(Screening, screening_id)
        reader = db.get(Reader, screening.reader_id)
        cartridge = screening.cartridge
        detail: dict = {}

        if key == "cartridge_verification":
            check = gateway.verify_cartridge(reader, cartridge)
            if not check.ok:
                raise RuntimeError(check.message)
            detail = {"message": check.message}
        elif key == "sample_quality":
            check = gateway.check_sample_quality(reader, cartridge)
            detail = {"message": check.message}
        elif key == "assay_processing":
            detail = {"message": gateway.process_assay(reader, cartridge).message}
        elif key == "image_capture":
            capture = gateway.capture(reader, cartridge)
            _captures[screening_id] = capture
            detail = {"message": f"{capture.width}×{capture.height} optical capture stored securely"}
        elif key == "vision_analysis":
            capture = _captures.pop(screening_id)
            assay, result = run_vision(db, screening.assay_result, screening, capture)
            detail = {
                "message": f"{result.model_version}: control {'valid' if result.control_valid else 'invalid'}, "
                           f"assay confidence {result.assay_confidence}",
                "control_valid": result.control_valid,
                "hpv_signal": result.hpv_signal,
                "secondary_marker": result.secondary_marker,
                "sample_quality": result.sample_quality,
                "assay_confidence": result.assay_confidence,
            }
        elif key == "risk_engine":
            assay = screening.assay_result
            if not assay.control_valid or assay.sample_quality == "poor":
                screening.status = ScreeningStatus.invalid_sample
                screening.outcome = None
                screening.decision_trace = {
                    "label": risk_engine.DECISION_LABEL,
                    "quality_gate": "failed",
                    "note": "Assay control invalid — no screening result generated; a new sample is required.",
                }
                detail = {"message": "Quality gate failed — recollection required"}
            else:
                intensity = assay.analyses[-1].signal_intensity.get("hpv", 0.0) if assay.analyses else 0.0
                decision = risk_engine.evaluate(db, risk_engine.build_input(db, screening, assay, intensity))
                screening.outcome = decision.outcome
                screening.decision_trace = decision.trace
                detail = {"message": f"{len(decision.trace['matched_rules'])} rule(s) matched · clinician review required"}
        elif key == "result_generated":
            now = datetime.now(UTC)
            screening.analysis_completed_at = now
            if screening.status != ScreeningStatus.invalid_sample:
                screening.status = ScreeningStatus.pending_review
            cartridge.status = CartridgeStatus.processed
            reader.current_cartridge_id = None
            reader.status = ReaderStatus.online
            reader.total_analyses += 1
            reader.last_heartbeat_at = now
            if screening.status == ScreeningStatus.invalid_sample:
                screening.kit.status = "used"
                upsert_passport_event(db, screening.patient_id, event_type="kaia_screening", screening_id=screening.id,
                                      event_date=now.date(), title="KAIA Screening", detail=f"Kit {screening.kit.kit_code}",
                                      institution_name=screening.organization.name,
                                      status="Sample could not be analyzed — new sample needed",
                                      source="kaia_platform", verified=True)
                notify(db, screening.patient.user_id, "Your sample needs to be collected again",
                       "Your sample could not be analyzed. This is not a result. Please register a new KAIA Kit.",
                       "screening", "/app")
            detail = {
                "message": "Awaiting clinician review" if screening.status == ScreeningStatus.pending_review
                else "Invalid sample — patient notified to recollect",
                "status": screening.status,
                "outcome": screening.outcome,
            }

        screening.analysis_stage = index
        db.commit()
        return detail


def _mark_failed(screening_id: uuid.UUID, message: str) -> None:
    with SessionLocal() as db:
        screening = db.get(Screening, screening_id)
        if screening is None:
            return
        screening.status = ScreeningStatus.cartridge_registered
        screening.analysis_stage = 0
        if screening.reader_id:
            reader = db.get(Reader, screening.reader_id)
            if reader and reader.status == ReaderStatus.analyzing:
                reader.status = ReaderStatus.online
        db.commit()


async def run(screening_id: uuid.UUID, reader_code: str) -> None:
    delay = settings.reader_stage_seconds
    total = len(STAGES)
    try:
        for index, (key, label) in enumerate(STAGES, start=1):
            reader_events.publish(reader_code, {"type": "stage_started", "stage": index, "total": total, "key": key,
                                                "label": label, "screening_id": str(screening_id)})
            if delay:
                await asyncio.sleep(delay)
            detail = await run_in_threadpool(_execute_stage, screening_id, index, key)
            reader_events.publish(reader_code, {"type": "stage_completed", "stage": index, "total": total, "key": key,
                                                "label": label, "detail": detail, "screening_id": str(screening_id)})
        reader_events.publish(reader_code, {"type": "analysis_complete", "screening_id": str(screening_id)})
    except Exception as exc:  # noqa: BLE001 — surface to operator, never leak internals
        log.exception("Analysis failed for screening %s", screening_id)
        _captures.pop(screening_id, None)
        await run_in_threadpool(_mark_failed, screening_id, str(exc))
        reader_events.publish(reader_code, {"type": "analysis_failed", "screening_id": str(screening_id),
                                            "message": "Analysis could not be completed. Please re-run the cartridge."})


def recover_interrupted(db: Session) -> None:
    """On startup, reset analyses interrupted by a restart."""
    from sqlalchemy import select

    for screening in db.scalars(select(Screening).where(Screening.status == ScreeningStatus.analyzing)):
        screening.status = ScreeningStatus.cartridge_registered
        screening.analysis_stage = 0
    for reader in db.scalars(select(Reader).where(Reader.status == ReaderStatus.analyzing)):
        reader.status = ReaderStatus.online
    db.commit()


def rerun_vision(db: Session, assay: AssayResult, actor: User) -> VisionResult:
    """Re-analyze a stored assay with the currently active KAIA Vision model (creates a new AIAnalysis)."""
    screening = assay.screening
    latest = assay.analyses[-1] if assay.analyses else None
    readout = {k: v for k, v in (latest.signal_intensity if latest else {}).items() if k != "background"}
    capture = AssayCapture(image_bytes=get_storage().read(assay.image_path), content_type="image/svg+xml",
                           width=720, height=420, sensor_readout=readout,
                           sample_volume_ok=readout.get("control", 0) >= 0.35,
                           chamber_temperature_c=screening.reader.temperature_c if screening.reader else 24.0)
    model_row = risk_engine.active_model(db, ModelType.vision)
    model = get_vision_model(model_row.version if model_row else None)
    result = model.analyze(capture)
    db.add(AIAnalysis(
        assay_result_id=assay.id, model_version_id=model_row.id if model_row else None,
        model_version=result.model_version, analysis_type="vision", image_url=assay.image_path,
        regions=result.regions, signal_intensity=result.signal_intensity, control_validity=result.control_valid,
        prediction=result.prediction, confidence=result.assay_confidence, confidence_score=result.confidence_score,
        pipeline=result.pipeline,
    ))
    return result


__all__ = ["STAGES", "begin", "run", "recover_interrupted", "rerun_vision", "ScreeningOutcome"]
