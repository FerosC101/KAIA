"""Screening workflow: kit registration → sample → cartridge → (analysis) → clinician review → release."""

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.models import Cartridge, InventoryBatch, Kit, Organization, PatientProfile, Reader, Screening, User
from app.models.enums import (
    CartridgeStatus,
    ConsentScope,
    InventoryStatus,
    KitStatus,
    ReaderStatus,
    ScreeningOutcome,
    ScreeningStatus,
    SimProfile,
)
from app.services import care
from app.services.common import notify, unique_code, upsert_passport_event

IN_PROGRESS = {
    ScreeningStatus.kit_registered,
    ScreeningStatus.sample_collected,
    ScreeningStatus.cartridge_registered,
    ScreeningStatus.analyzing,
    ScreeningStatus.pending_review,
}

OUTCOME_PASSPORT_STATUS = {
    ScreeningOutcome.routine_screening: "No high-risk screening signal",
    ScreeningOutcome.follow_up_recommended: "Screening marker detected — follow-up recommended",
    ScreeningOutcome.priority_follow_up: "Multiple screening signals — priority follow-up",
}


def _now() -> datetime:
    return datetime.now(UTC)


def normalize_code(code: str) -> str:
    return code.strip().upper()


def _consume_stock(db: Session, batch_id) -> None:
    batch = db.get(InventoryBatch, batch_id)
    if batch is not None and batch.quantity > 0:
        batch.quantity -= 1
        if batch.quantity == 0:
            batch.status = InventoryStatus.depleted


def register_kit(
    db: Session, patient: PatientProfile, kit_code: str, site: Organization, *, consent_via: str = "kit_registration"
) -> Screening:
    kit = db.scalar(select(Kit).where(Kit.kit_code == normalize_code(kit_code)))
    if kit is None:
        raise not_found("KAIA Kit")
    if kit.status not in (KitStatus.in_stock, KitStatus.distributed):
        raise conflict("This kit has already been registered")
    if not site.active or "kaia_screening" not in (site.services or []):
        raise bad_request(f"{site.name} is not a KAIA screening site")
    in_progress = db.scalar(
        select(Screening).where(Screening.patient_id == patient.id, Screening.status.in_(IN_PROGRESS))
    )
    if in_progress is not None:
        raise conflict(f"You already have a screening in progress ({in_progress.kit.kit_code})")

    now = _now()
    screening = Screening(
        screening_code=unique_code(db, Screening, Screening.screening_code, "SCR-26-"),
        patient_id=patient.id,
        kit_id=kit.id,
        organization_id=site.id,
        barangay_id=patient.barangay_id,
        status=ScreeningStatus.kit_registered,
        registered_at=now,
    )
    db.add(screening)
    if kit.status == KitStatus.in_stock and kit.batch_id:
        _consume_stock(db, kit.batch_id)
    kit.status = KitStatus.registered
    kit.registered_at = now
    kit.patient_id = patient.id
    kit.distributed_at = kit.distributed_at or now
    kit.barangay_id = kit.barangay_id or patient.barangay_id
    db.flush()

    care.ensure_consent(db, patient.id, site, ConsentScope.screening, consent_via)
    upsert_passport_event(db, patient.id, event_type="kaia_screening", screening_id=screening.id,
                          event_date=now.date(), title="KAIA Screening", detail=f"Kit {kit.kit_code}",
                          institution_name=site.name, status="In progress", source="kaia_platform", verified=True)
    notify(db, patient.user_id, "KAIA Kit registered",
           f"Kit {kit.kit_code} is linked to your account. Collect your sample using the KAIA Collect insert.",
           "screening", "/app")
    return screening


def mark_sample_collected(db: Session, screening: Screening) -> None:
    if screening.status != ScreeningStatus.kit_registered:
        raise conflict("Sample has already been recorded for this screening")
    screening.status = ScreeningStatus.sample_collected
    screening.sample_collected_at = _now()


def register_cartridge(
    db: Session, screening: Screening, worker: User, cartridge_code: str, reader_code: str, sim_profile: str | None
) -> None:
    if screening.status not in (ScreeningStatus.sample_collected, ScreeningStatus.cartridge_registered):
        raise conflict("A sample must be returned before a cartridge can be registered")
    if screening.organization_id != worker.organization_id:
        raise forbidden("This screening belongs to another screening site")
    cartridge = db.scalar(select(Cartridge).where(Cartridge.cartridge_code == normalize_code(cartridge_code)))
    if cartridge is None or cartridge.organization_id != worker.organization_id:
        raise not_found("Cartridge in your site inventory")
    reader = db.scalar(select(Reader).where(Reader.reader_code == normalize_code(reader_code)))
    if reader is None or reader.organization_id != worker.organization_id:
        raise not_found("Reader at your site")
    if cartridge.lot_expiry < date.today():
        raise bad_request("Cartridge lot has expired")
    if screening.cartridge_id not in (None, cartridge.id) or (
        cartridge.status not in (CartridgeStatus.in_stock, CartridgeStatus.assigned)
        and screening.cartridge_id != cartridge.id
    ):
        raise conflict("Cartridge is already in use")
    if reader.status not in (ReaderStatus.online,):
        raise conflict(f"{reader.reader_code} is {reader.status}")
    if reader.current_cartridge_id not in (None, cartridge.id):
        raise conflict(f"{reader.reader_code} already has a cartridge inserted")

    # release a previously assigned reader if re-assigning
    if screening.reader_id and screening.reader_id != reader.id:
        previous = db.get(Reader, screening.reader_id)
        if previous and previous.current_cartridge_id == cartridge.id:
            previous.current_cartridge_id = None

    if cartridge.status == CartridgeStatus.in_stock and cartridge.batch_id:
        _consume_stock(db, cartridge.batch_id)
    screening.cartridge_id = cartridge.id
    screening.reader_id = reader.id
    screening.status = ScreeningStatus.cartridge_registered
    cartridge.status = CartridgeStatus.inserted
    if sim_profile:
        cartridge.sim_profile = SimProfile(sim_profile)
    reader.current_cartridge_id = cartridge.id


def release_result(
    db: Session, screening: Screening, reviewer: User, override_outcome: str | None, notes: str | None
) -> None:
    if screening.status != ScreeningStatus.pending_review:
        raise conflict("Only analyzed screenings awaiting review can be released")
    if screening.organization_id != reviewer.organization_id:
        raise forbidden("Results can only be reviewed by the screening site")
    now = _now()
    trace = dict(screening.decision_trace or {})
    if override_outcome and override_outcome != screening.outcome:
        if not notes or len(notes.strip()) < 10:
            raise bad_request("A clinical justification (min. 10 characters) is required to change the outcome")
        trace["clinician_override"] = {
            "from": screening.outcome,
            "to": override_outcome,
            "at": now.isoformat(),
            "reviewer_role": reviewer.role,
        }
        screening.outcome = override_outcome
    trace["reviewed"] = True
    screening.decision_trace = trace
    screening.review_notes = notes
    screening.reviewed_by_id = reviewer.id
    screening.reviewed_at = now
    screening.released_at = now
    screening.status = ScreeningStatus.result_ready
    screening.kit.status = KitStatus.used
    db.flush()

    pathway = care.create_pathway(db, screening)
    upsert_passport_event(db, screening.patient_id, event_type="kaia_screening", screening_id=screening.id,
                          event_date=now.date(), title="KAIA Screening", detail=f"Kit {screening.kit.kit_code}",
                          institution_name=screening.organization.name,
                          status=OUTCOME_PASSPORT_STATUS[screening.outcome], source="kaia_platform", verified=True)
    if screening.outcome == ScreeningOutcome.routine_screening:
        upsert_passport_event(db, screening.patient_id, event_type="routine_recall", screening_id=screening.id,
                              event_date=pathway.due_date, title="Next Routine Screening",
                              detail="Recommended routine screening interval", institution_name=screening.organization.name,
                              status="Upcoming", source="kaia_platform", verified=False)
    # Deliberately generic: notifications may appear on a lock screen.
    notify(db, screening.patient.user_id, "Your KAIA screening result is ready",
           "Open KAIA to view your result and recommended next steps.", "result", f"/app/results/{screening.id}")
