"""Deterministic synthetic demo data for KAIA. Contains NO real patient information.

Usage:
    python -m app.seed            # seed an empty database
    python -m app.seed --reset    # wipe everything and re-seed
"""

import argparse
import random
import shutil
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.core.timeutil import local_day_bounds, local_today
from app.db.base import Base
from app.db.session import SessionLocal
from app.models import (
    AIAnalysis,
    Appointment,
    AssayResult,
    AuditLog,
    Barangay,
    CarePathway,
    Cartridge,
    Consent,
    FollowUp,
    HealthWorker,
    InventoryBatch,
    Kit,
    ModelVersion,
    Notification,
    Organization,
    PathwayConfig,
    PatientProfile,
    ProgramAggregate,
    Reader,
    Referral,
    RiskRule,
    Screening,
    User,
)
from app.models.enums import (
    AppointmentStatus,
    CartridgeStatus,
    ConsentScope,
    ConsentStatus,
    EventSource,
    FollowUpEventType,
    InventoryItemType,
    InventoryStatus,
    KitStatus,
    ModelStatus,
    ModelType,
    ReaderStatus,
    ReferralPriority,
    ReferralStatus,
    ReferralType,
    Role,
    ScreeningOutcome,
    ScreeningStatus,
    SimProfile,
)
from app.services import analytics, care, risk_engine
from app.services.common import age_bracket_for, notify, passport_event, upsert_passport_event
from app.services.reader.simulator import SimulatedReaderGateway
from app.services.screening import OUTCOME_PASSPORT_STATUS
from app.services.storage import get_storage
from app.services.vision.simulated import SimulatedVisionModel

DEMO_PASSWORD = "KaiaDemo2026!"
DOMAIN = "demo.kaia.ph"
FU = ScreeningOutcome.follow_up_recommended
PR = ScreeningOutcome.priority_follow_up
RT = ScreeningOutcome.routine_screening

OUTCOME_PROFILE = {RT: SimProfile.negative, FU: SimProfile.hpv_other_high_risk, PR: SimProfile.hpv_with_marker}

# --- program targets (Batangas City Health Office) ---------------------------------
PROGRAM_TOTALS = {"eligible": 5000, "kits_distributed": 3840, "samples_returned": 3210, "valid_screenings": 3105,
                  "follow_up_required": 184, "follow_up_completed": 139}
SPECIAL_BARANGAYS = {
    "San Isidro": {"eligible": 450, "kits_distributed": 260, "samples_returned": 158, "valid_screenings": 153,
                   "follow_up_required": 9, "follow_up_completed": 7, "avg_days": 31},
    "Mabini": {"eligible": 400, "kits_distributed": 350, "samples_returned": 305, "valid_screenings": 296,
               "follow_up_required": 22, "follow_up_completed": 9, "avg_days": 38},
}
OTHER_BARANGAYS = [  # name, eligible, participation factor, average days to follow-up
    ("Alangilan", 520, 1.05, 24), ("Balagtas", 380, 0.95, 26), ("Bolbok", 450, 1.02, 22),
    ("Calicanto", 360, 0.97, 27), ("Cuta", 410, 1.00, 25), ("Kumintang Ibaba", 480, 1.06, 21),
    ("Libjo", 330, 0.93, 28), ("Pallocan", 420, 1.01, 23), ("Sta. Rita Karsada", 390, 0.98, 26),
    ("Tabangao", 410, 1.03, 49),
]
METRICS = ["kits_distributed", "samples_returned", "valid_screenings", "follow_up_required", "follow_up_completed"]

FIRST_NAMES = ["Andrea", "Bea", "Camille", "Danica", "Elena", "Francesca", "Gloria", "Hazel", "Isabel", "Jasmine",
               "Katrina", "Lorna", "Marites", "Nina", "Olivia", "Patricia", "Rhea", "Sheila", "Teresa", "Vanessa",
               "Wilma", "Ysabel", "Zenaida", "Angelica", "Rosario", "Cristina", "Divina", "Evangeline", "Jocelyn", "Liezl"]
LAST_NAMES = ["Dela Cruz", "Garcia", "Reyes", "Ramos", "Mendoza", "Castillo", "Villanueva", "Bautista", "Aquino",
              "Navarro", "Torres", "Flores", "Gonzales", "Lopez", "Manalo", "Perez", "Salazar", "Tolentino", "Pascual",
              "Marquez", "Evangelista", "Lacson", "Panganiban", "Ilagan", "Macaraig"]


def apportion(total: int, weights: list[float]) -> list[int]:
    """Largest-remainder apportionment: integers proportional to weights that sum exactly to total."""
    if not weights:
        return []
    if total <= 0:
        return [0] * len(weights)
    s = sum(weights)
    if s <= 0:
        weights, s = [1.0] * len(weights), float(len(weights))
    raw = [total * w / s for w in weights]
    base = [int(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)[: total - sum(base)]:
        base[i] += 1
    return base


@dataclass
class Ctx:
    db: Session
    rng: random.Random
    now: datetime
    today: date
    day_start: datetime
    pw_hash: str
    orgs: dict[str, Organization] = field(default_factory=dict)
    barangays: dict[str, Barangay] = field(default_factory=dict)
    readers: dict[str, Reader] = field(default_factory=dict)
    batches: dict[str, InventoryBatch] = field(default_factory=dict)
    staff: dict[str, User] = field(default_factory=dict)
    used_codes: set[str] = field(default_factory=set)
    gateway: SimulatedReaderGateway = field(default_factory=SimulatedReaderGateway)
    vision: SimulatedVisionModel = field(default_factory=lambda: SimulatedVisionModel("kaia-vision-sim-1.3.0"))
    vision_model_id: object = None

    def code(self, prefix: str, digits: int = 5, reserved: tuple = ()) -> str:
        while True:
            value = f"{prefix}{self.rng.randint(1, 10**digits - 1):0{digits}d}"
            if value not in self.used_codes and value not in reserved:
                self.used_codes.add(value)
                return value


# ---------------------------------------------------------------------------------------------


def wipe(db: Session) -> None:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()
    shutil.rmtree(Path(settings.media_root) / "assays", ignore_errors=True)


def seed_organizations(ctx: Ctx) -> None:
    data = [
        dict(code="BCHO", name="Batangas City Health Office", org_type="lgu_health_office",
             address="P. Burgos St., Poblacion, Batangas City", phone="(043) 555-0101", operating_hours="Mon–Fri · 8:00 AM – 5:00 PM",
             services=["kaia_screening", "kit_distribution", "counseling", "community_outreach", "hpv_vaccination"]),
        dict(code="KPP", name="KAIA Partner Pharmacy", org_type="pharmacy",
             address="Rizal Ave., Batangas City", phone="(043) 555-0144", operating_hours="Daily · 7:00 AM – 9:00 PM",
             services=["kaia_screening", "kit_distribution"]),
        dict(code="KWHC", name="KAIA Women's Health Clinic", org_type="clinic",
             address="Kumintang Ilaya, Batangas City", phone="(043) 555-0188", operating_hours="Mon–Sat · 8:00 AM – 6:00 PM",
             services=["kaia_screening", "confirmatory_screening", "clinical_evaluation", "same_week_appointments", "counseling"]),
    ]
    for d in data:
        org = Organization(city="Batangas City", province="Batangas", is_referral_partner=True, **d)
        ctx.db.add(org)
        ctx.orgs[d["code"]] = org
    ctx.db.flush()


def seed_barangays(ctx: Ctx) -> None:
    bcho = ctx.orgs["BCHO"]
    for name, eligible, _, _ in OTHER_BARANGAYS:
        ctx.barangays[name] = Barangay(name=name, city="Batangas City", organization_id=bcho.id, eligible_population=eligible)
    for name, d in SPECIAL_BARANGAYS.items():
        ctx.barangays[name] = Barangay(name=name, city="Batangas City", organization_id=bcho.id, eligible_population=d["eligible"])
    ctx.db.add_all(ctx.barangays.values())
    ctx.db.flush()


def seed_configuration(ctx: Ctx) -> None:
    db = ctx.db
    db.add_all([
        PathwayConfig(pathway_key=risk_engine.PATHWAY_KEY, outcome=RT, recommended_action="Continue routine screening",
                      referral_type=None, timeframe_days=1825, required_service=None,
                      patient_message="No high-risk screening signal was identified in this test.",
                      next_step_message="Continue routine screening according to healthcare guidance."),
        PathwayConfig(pathway_key=risk_engine.PATHWAY_KEY, outcome=FU, recommended_action="Confirmatory cervical-health screening",
                      referral_type=ReferralType.confirmatory_screening, timeframe_days=28, required_service="confirmatory_screening",
                      patient_message="Your screening identified a marker requiring additional clinical evaluation. "
                                      "This is not a cancer diagnosis.",
                      next_step_message="Confirmatory screening is recommended."),
        PathwayConfig(pathway_key=risk_engine.PATHWAY_KEY, outcome=PR, recommended_action="Priority clinical evaluation",
                      referral_type=ReferralType.clinical_evaluation, timeframe_days=14, required_service="clinical_evaluation",
                      patient_message="Multiple screening signals suggest that clinical evaluation should be prioritized.",
                      next_step_message="Please complete clinical follow-up as soon as practical."),
    ])
    for rule in risk_engine.DEFAULT_RULES:
        db.add(RiskRule(pathway_key=risk_engine.PATHWAY_KEY, active=True, **rule))
    t = ctx.today
    note = "Synthetic benchmark on simulated assays — prototype only, not clinically validated."
    models = [
        ModelVersion(name="kaia-vision-sim", model_type=ModelType.vision, version="1.2.0", status=ModelStatus.retired,
                     description=f"Initial region detector. {note}", released_at=t - timedelta(days=260),
                     metrics={"region_detection_map": 0.931, "line_call_agreement": 0.917, "invalid_detection_recall": 0.972}),
        ModelVersion(name="kaia-vision-sim", model_type=ModelType.vision, version="kaia-vision-sim-1.3.0", status=ModelStatus.active,
                     description=f"Fiducial-anchored detection with background subtraction. {note}", released_at=t - timedelta(days=95),
                     activated_at=ctx.now - timedelta(days=90),
                     metrics={"region_detection_map": 0.962, "line_call_agreement": 0.948, "invalid_detection_recall": 0.991}),
        ModelVersion(name="kaia-vision-sim", model_type=ModelType.vision, version="kaia-vision-sim-1.4.0-rc1", status=ModelStatus.shadow,
                     description=f"Candidate: illumination-robust quantification, running in shadow mode. {note}",
                     released_at=t - timedelta(days=12),
                     metrics={"region_detection_map": 0.971, "line_call_agreement": 0.955, "invalid_detection_recall": 0.993}),
        ModelVersion(name="kaia-risk-model-sim", model_type=ModelType.risk, version="0.4.0", status=ModelStatus.active,
                     description=f"Constrained prioritization model: may escalate follow-up, never de-escalate. {note}",
                     released_at=t - timedelta(days=120), activated_at=ctx.now - timedelta(days=110),
                     metrics={"escalation_precision": 0.88, "rule_concordance": 0.97}),
        ModelVersion(name="kaia-continuity-sim", model_type=ModelType.continuity, version="0.3.0", status=ModelStatus.active,
                     description=f"Predicts risk of incomplete follow-up (not disease). {note}",
                     released_at=t - timedelta(days=70), activated_at=ctx.now - timedelta(days=60),
                     metrics={"auroc": 0.81, "calibration_error": 0.04}),
    ]
    db.add_all(models)
    db.flush()
    ctx.vision_model_id = models[1].id


def seed_devices(ctx: Ctx) -> None:
    db, t, o = ctx.db, ctx.today, ctx.orgs
    specs = [
        ("KAIA-RDR-001", "BCHO", "Batangas City Health Office — Screening Room 1", ReaderStatus.online, "v1.2.3", 24.1, 9),
        ("KAIA-RDR-002", "BCHO", "Batangas City Health Office — Mobile Outreach Unit", ReaderStatus.offline, "v1.2.1", 26.8, 41),
        ("KAIA-RDR-003", "BCHO", "Batangas Community Health Center", ReaderStatus.online, "v1.2.3", 24.6, 3),
        ("KAIA-RDR-004", "KPP", "KAIA Partner Pharmacy — Counter Lab", ReaderStatus.online, "v1.2.2", 25.2, 16),
        ("KAIA-RDR-005", "KWHC", "KAIA Women's Health Clinic — Diagnostics Suite", ReaderStatus.online, "v1.2.3", 23.8, 6),
    ]
    for code, org, location, status, fw, temp, cal_days in specs:
        heartbeat = ctx.now - (timedelta(days=2, hours=3) if status == ReaderStatus.offline else timedelta(minutes=ctx.rng.randint(1, 4)))
        reader = Reader(reader_code=code, serial_number=f"SN-{code[-3:]}-{2025 + (cal_days % 2)}{ctx.rng.randint(1000, 9999)}",
                        organization_id=o[org].id, location_name=location, status=status, firmware_version=fw,
                        temperature_c=temp, last_calibration=t - timedelta(days=cal_days), last_heartbeat_at=heartbeat)
        db.add(reader)
        ctx.readers[code] = reader
    batch_specs = [
        ("KB-2026-07-A", "BCHO", InventoryItemType.kit, 60, 480, 400, 180, 100, "BCHO Supply Room"),
        ("KB-2026-03-B", "BCHO", InventoryItemType.kit, 180, 360, 500, 40, 50, "Barangay Health Stations"),
        ("CB-2026-06-A", "BCHO", InventoryItemType.cartridge, 90, 300, 400, 120, 60, "BCHO Laboratory Fridge"),
        ("CB-2026-02-C", "BCHO", InventoryItemType.cartridge, 210, 45, 300, 25, 30, "BCHO Laboratory Fridge"),
        ("RB-2025-11", "BCHO", InventoryItemType.reader, 300, 1500, 4, 1, 1, "BCHO Equipment Store"),
        ("KB-2026-08-P", "KPP", InventoryItemType.kit, 30, 500, 120, 60, 30, "Pharmacy Counter Stock"),
        ("CB-2026-08-P", "KPP", InventoryItemType.cartridge, 25, 330, 60, 35, 20, "Pharmacy Cold Storage"),
        ("KB-2026-05-W", "KWHC", InventoryItemType.kit, 120, 420, 150, 22, 25, "Clinic Front Desk"),
        ("CB-2026-07-W", "KWHC", InventoryItemType.cartridge, 60, 270, 150, 80, 30, "Clinic Diagnostics Suite"),
    ]
    for number, org, item, made_ago, expires_in, initial, qty, threshold, location in batch_specs:
        batch = InventoryBatch(organization_id=o[org].id, item_type=item, batch_number=number,
                               manufacture_date=t - timedelta(days=made_ago), expiry_date=t + timedelta(days=expires_in),
                               initial_quantity=initial, quantity=qty, reorder_threshold=threshold, location=location,
                               status=InventoryStatus.available)
        db.add(batch)
        ctx.batches[number] = batch
    db.flush()


def seed_staff(ctx: Ctx) -> None:
    specs = [
        ("ana.reyes", "Ana Reyes", "BCHO", Role.health_worker, "Municipal Midwife"),
        ("carlo.mendoza", "Carlo Mendoza", "BCHO", Role.health_worker, "Public Health Nurse"),
        ("joy.villanueva", "Joy Villanueva", "KPP", Role.health_worker, "Pharmacist"),
        ("liza.cruz", "Dr. Liza Cruz", "KWHC", Role.health_worker, "OB-GYN Physician"),
        ("grace.aquino", "Grace Aquino", "KWHC", Role.health_worker, "Clinic Nurse"),
        ("ramon.bautista", "Dr. Ramon Bautista", "BCHO", Role.institution_admin, "City Health Officer"),
        ("teresa.lim", "Teresa Lim", "KWHC", Role.institution_admin, "Clinic Administrator"),
        ("sysadmin", "KAIA Platform Operations", None, Role.system_admin, None),
    ]
    for i, (handle, name, org, role, position) in enumerate(specs):
        user = User(email=f"{handle}@{DOMAIN}", password_hash=ctx.pw_hash, role=role, full_name=name, is_demo=True,
                    organization_id=ctx.orgs[org].id if org else None,
                    last_login_at=ctx.now - timedelta(hours=ctx.rng.randint(1, 30)))
        ctx.db.add(user)
        ctx.db.flush()
        if role == Role.health_worker:
            ctx.db.add(HealthWorker(user_id=user.id, organization_id=ctx.orgs[org].id, position=position,
                                    employee_code=f"{org}-HW-{101 + i}"))
        ctx.staff[handle] = user
    ctx.db.flush()


def create_patient(ctx: Ctx, full_name: str, email: str, code: str, birth: date, barangay: Barangay, distance: str,
                   research_consent: bool = True) -> PatientProfile:
    user = User(email=email, password_hash=ctx.pw_hash, role=Role.patient, full_name=full_name, is_demo=True,
                last_login_at=ctx.now - timedelta(days=ctx.rng.randint(0, 20)))
    ctx.db.add(user)
    ctx.db.flush()
    profile = PatientProfile(user_id=user.id, patient_code=code, birth_date=birth.isoformat(),
                             age_bracket=age_bracket_for(birth, ctx.today),
                             phone=f"+63 9{ctx.rng.randint(10, 99)} 555 {ctx.rng.randint(1000, 9999)}",
                             address=f"Synthetic address, {barangay.name}", barangay_id=barangay.id, distance_category=distance)
    ctx.db.add(profile)
    ctx.db.flush()
    ctx.used_codes.add(code)
    if research_consent:
        ctx.db.add(Consent(patient_id=profile.id, organization_id=None, grantee_name="KAIA Research Program",
                           scope=ConsentScope.anonymous_statistics, status=ConsentStatus.granted, granted_via="registration",
                           granted_at=ctx.now - timedelta(days=ctx.rng.randint(30, 400))))
    return profile


def seed_maria(ctx: Ctx) -> PatientProfile:
    db = ctx.db
    maria = create_patient(ctx, "Maria Santos", f"maria.santos@{DOMAIN}", "KAIA-USER-0921", date(1991, 4, 12),
                           ctx.barangays["Kumintang Ibaba"], "moderate")
    bcho = ctx.orgs["BCHO"]
    passport_event(db, maria.id, event_date=date(2014, 8, 20), event_type="hpv_vaccination", title="HPV Vaccination",
                   detail="School-based immunization program (2-dose series)", institution_name=bcho.name,
                   status="Completed", source="facility_record", verified=True)
    passport_event(db, maria.id, event_date=date(2023, 3, 14), event_type="routine_screening", title="Routine Screening",
                   detail="Community Pap smear drive", institution_name=bcho.name, status="Completed",
                   source="self_reported", verified=False)
    db.add(Kit(kit_code="K26-00921", batch_id=ctx.batches["KB-2026-07-A"].id, organization_id=bcho.id,
               status=KitStatus.distributed, barangay_id=maria.barangay_id, distributed_at=ctx.now - timedelta(days=2)))
    ctx.used_codes.update({"K26-00921", "KAIA-CAR-00921"})
    db.add(Cartridge(cartridge_code="KAIA-CAR-00921", batch_id=ctx.batches["CB-2026-06-A"].id, organization_id=bcho.id,
                     status=CartridgeStatus.in_stock, lot_expiry=ctx.today + timedelta(days=300),
                     sim_profile=SimProfile.hpv_other_high_risk))
    notify(db, maria.user_id, "Welcome to KAIA", "Your privacy-first screening record is ready.", "account", "/app")
    notify(db, maria.user_id, "Your KAIA Kit is ready to register",
           "Batangas City Health Office gave you kit K26-00921. Register it to begin your screening.", "screening", "/app/register-kit")
    return maria


def seed_patients(ctx: Ctx) -> list[PatientProfile]:
    names: set[str] = set()
    weights = {name: 1.0 for name in ctx.barangays}
    weights["Mabini"], weights["San Isidro"] = 1.6, 0.6
    barangay_names = list(weights)
    patients = []
    for i in range(49):
        while True:
            full = f"{ctx.rng.choice(FIRST_NAMES)} {ctx.rng.choice(LAST_NAMES)}"
            if full not in names:
                names.add(full)
                break
        first, last = full.split(" ", 1)
        code = "KAIA-USER-0104" if i == 0 else ctx.code("KAIA-USER-", 4, reserved=("KAIA-USER-0921",))
        birth = date(ctx.rng.randint(1964, 2000), ctx.rng.randint(1, 12), ctx.rng.randint(1, 28))
        barangay = ctx.barangays[ctx.rng.choices(barangay_names, weights=[weights[n] for n in barangay_names])[0]]
        distance = ctx.rng.choices(["near", "moderate", "far"], weights=[0.5, 0.35, 0.15])[0]
        email = f"{first}.{last.replace(' ', '')}.{i + 1}@{DOMAIN}".lower()
        patients.append(create_patient(ctx, full, email, code, birth, barangay, distance, research_consent=ctx.rng.random() < 0.85))
    return patients


# --- screenings ------------------------------------------------------------------------------


def _anchor(ctx: Ctx, days: int) -> datetime:
    if days == 0:
        return max(ctx.now - timedelta(minutes=ctx.rng.randint(20, 150)), ctx.day_start + timedelta(minutes=5))
    return ctx.now - timedelta(days=days, minutes=ctx.rng.randint(0, 240))


def _analyze(ctx: Ctx, screening: Screening, site_code: str, profile: str, at: datetime, reader_codes: list[str]) -> str | None:
    db = ctx.db
    reader = ctx.readers[ctx.rng.choice(reader_codes)]
    cartridge = Cartridge(cartridge_code=ctx.code("KAIA-CAR-"), organization_id=ctx.orgs[site_code].id,
                          status=CartridgeStatus.processed, lot_expiry=ctx.today + timedelta(days=200), sim_profile=profile)
    db.add(cartridge)
    db.flush()
    screening.cartridge_id, screening.reader_id = cartridge.id, reader.id
    screening.analysis_started_at, screening.analysis_completed_at = at - timedelta(minutes=11), at
    screening.analysis_stage = 7
    reader.total_analyses += 1

    capture = ctx.gateway.capture(reader, cartridge)
    result = ctx.vision.analyze(capture)
    image_path = f"assays/{screening.id.hex}.svg"
    get_storage().save(image_path, capture.image_bytes, capture.content_type)
    assay = AssayResult(screening_id=screening.id, reader_id=reader.id, control_valid=result.control_valid,
                        hpv_signal=result.hpv_signal, hpv_genotype=result.hpv_genotype, secondary_marker=result.secondary_marker,
                        sample_quality=result.sample_quality, assay_confidence=result.assay_confidence, image_path=image_path,
                        captured_at=at - timedelta(minutes=3))
    db.add(assay)
    db.flush()
    db.add(AIAnalysis(assay_result_id=assay.id, model_version_id=ctx.vision_model_id, model_version=result.model_version,
                      analysis_type="vision", image_url=image_path, regions=result.regions, signal_intensity=result.signal_intensity,
                      control_validity=result.control_valid, prediction=result.prediction, confidence=result.assay_confidence,
                      confidence_score=result.confidence_score, pipeline=result.pipeline, created_at=at, updated_at=at))
    if not result.control_valid:
        screening.status = ScreeningStatus.invalid_sample
        screening.decision_trace = {"label": risk_engine.DECISION_LABEL, "quality_gate": "failed",
                                    "note": "Assay control invalid — no screening result generated; a new sample is required."}
        return None
    decision = risk_engine.evaluate(db, risk_engine.RiskInput(
        control_valid=result.control_valid, hpv_signal=result.hpv_signal, hpv_genotype=result.hpv_genotype or "none",
        secondary_marker=result.secondary_marker, sample_quality=result.sample_quality,
        hpv_signal_intensity=result.signal_intensity.get("hpv", 0.0), prior_high_risk_result=False,
        prior_missed_follow_up=False, age_bracket=screening.patient.age_bracket))
    screening.outcome = decision.outcome
    screening.decision_trace = decision.trace
    return decision.outcome


def _event(ctx: Ctx, referral: Referral, event_type: str, at: datetime, source: str = EventSource.health_worker,
           verified: bool = True, notes: str | None = None, by: User | None = None) -> None:
    ctx.db.add(FollowUp(referral_id=referral.id, event_type=event_type, occurred_at=at, source=source, verified=verified,
                        notes=notes, recorded_by_id=by.id if by else None, created_at=at, updated_at=at))


def _referral(ctx: Ctx, pathway: CarePathway, screening: Screening, status: str, ref_at: datetime, *,
              appt_in: int | None = None, site_worker: User, dest_worker: User) -> Referral:
    db = ctx.db
    dest = ctx.orgs["KWHC"]
    patient = screening.patient
    referral = Referral(referral_code=ctx.code("REF-26-"), patient_id=patient.id, screening_id=screening.id,
                        care_pathway_id=pathway.id, source_org_id=screening.organization_id, destination_org_id=dest.id,
                        referral_type=pathway.referral_type, generated_at=ref_at, status_changed_at=ref_at,
                        priority=ReferralPriority.priority if pathway.pathway_type == PR else ReferralPriority.standard,
                        status=ReferralStatus.created, created_by_id=site_worker.id,
                        preferred_schedule=(ref_at + timedelta(days=7)).date())
    db.add(referral)
    db.flush()
    pathway.referrals.append(referral)
    if not db.scalar(select(Consent).where(Consent.patient_id == patient.id, Consent.organization_id == dest.id,
                                           Consent.scope == ConsentScope.referral)):
        db.add(Consent(patient_id=patient.id, organization_id=dest.id, grantee_name=dest.name, scope=ConsentScope.referral,
                       granted_via="referral", granted_at=ref_at))
    _event(ctx, referral, FollowUpEventType.referral_created, ref_at, by=site_worker)
    label = care.REFERRAL_TYPE_LABELS[referral.referral_type]
    passport_status, confirm_status, confirm_detail, confirm_date, confirm_verified = "Created", "Pending", None, pathway.due_date, False

    def appointment(at: datetime, st: str) -> Appointment:
        appt = Appointment(referral_id=referral.id, organization_id=dest.id, scheduled_for=at, status=st,
                           recorded_by_id=dest_worker.id)
        db.add(appt)
        referral.appointments.append(appt)
        return appt

    if status == ReferralStatus.created:
        if ctx.rng.random() < 0.5:
            _event(ctx, referral, FollowUpEventType.reminder_sent, ref_at + timedelta(days=3), source=EventSource.system)
    elif status == ReferralStatus.scheduled:
        at = datetime.combine(ctx.today + timedelta(days=appt_in or 5), time(1, 0), tzinfo=UTC)  # 9:00 AM Manila
        appointment(at, AppointmentStatus.scheduled)
        _event(ctx, referral, FollowUpEventType.appointment_scheduled, ref_at + timedelta(days=1), by=dest_worker)
        passport_status = "Scheduled"
        referral.status_changed_at = ref_at + timedelta(days=1)
    elif status == ReferralStatus.missed:
        at = ref_at + timedelta(days=7)
        appointment(at, AppointmentStatus.missed)
        _event(ctx, referral, FollowUpEventType.appointment_scheduled, ref_at + timedelta(days=1), by=dest_worker)
        _event(ctx, referral, FollowUpEventType.missed, at + timedelta(hours=8), by=dest_worker)
        referral.status_changed_at = at + timedelta(hours=8)
        passport_status = "Missed"
    elif status in (ReferralStatus.attended, ReferralStatus.completed):
        at = ref_at + timedelta(days=ctx.rng.randint(3, 9))
        at = min(at, ctx.now - timedelta(days=1))
        appointment(at, AppointmentStatus.attended)
        _event(ctx, referral, FollowUpEventType.appointment_scheduled, ref_at + timedelta(hours=20), by=dest_worker)
        _event(ctx, referral, FollowUpEventType.attended, at, by=dest_worker)
        referral.status_changed_at = at
        passport_status, confirm_status, confirm_detail, confirm_date, confirm_verified = (
            "Attended", "In progress", "Visit confirmed by facility", at.date(), True)
        if status == ReferralStatus.completed:
            done = min(at + timedelta(days=ctx.rng.randint(0, 6)), ctx.now - timedelta(hours=2))
            _event(ctx, referral, FollowUpEventType.confirmatory_screening_done, done, by=dest_worker)
            _event(ctx, referral, FollowUpEventType.care_completed, done, by=dest_worker)
            referral.status_changed_at = done
            passport_status, confirm_status, confirm_date = "Completed", "Completed", done.date()
            confirm_detail = care.COMPLETION_OUTCOMES["return_to_routine_screening"]
    elif status == ReferralStatus.cancelled:
        _event(ctx, referral, FollowUpEventType.cancelled, ref_at + timedelta(days=4), source=EventSource.patient, verified=False)
        referral.status_changed_at = ref_at + timedelta(days=4)
        passport_status, confirm_status, confirm_detail = "Cancelled", "Cancelled", "Referral cancelled"
    referral.status = status

    upsert_passport_event(db, patient.id, event_type="referral", referral_id=referral.id, event_date=ref_at.date(),
                          title="Clinical Referral", detail=label, institution_name=dest.name, status=passport_status,
                          source="facility_record" if status not in (ReferralStatus.created,) else "kaia_platform", verified=True)
    upsert_passport_event(db, patient.id, event_type="confirmatory_screening", referral_id=referral.id, event_date=confirm_date,
                          title="Confirmatory Screening", detail=confirm_detail, institution_name=dest.name,
                          status=confirm_status, source="facility_record" if confirm_verified else "kaia_platform",
                          verified=confirm_verified)
    care.sync_pathway(pathway)
    return referral


def make_screening(ctx: Ctx, patient: PatientProfile, site_code: str, state: str, p: dict) -> Screening:
    db, rng = ctx.db, ctx.rng
    site = ctx.orgs[site_code]
    anchor = p.get("anchor") or _anchor(ctx, p.get("days", 0))
    site_readers = {"BCHO": ["KAIA-RDR-001", "KAIA-RDR-003"], "KPP": ["KAIA-RDR-004"], "KWHC": ["KAIA-RDR-005"]}[site_code]
    worker = {"BCHO": ctx.staff["ana.reyes"], "KPP": ctx.staff["joy.villanueva"], "KWHC": ctx.staff["liza.cruz"]}[site_code]

    if state == "kit_registered":
        registered = anchor
    elif state in ("sample_collected", "cartridge_registered"):
        registered = anchor - timedelta(days=rng.randint(1, 5), hours=rng.randint(0, 6))
    else:
        registered = anchor - timedelta(days=rng.randint(3, 7), hours=rng.randint(0, 6))

    kit = Kit(kit_code=ctx.code("K26-", reserved=("K26-00921",)), organization_id=site.id, barangay_id=patient.barangay_id,
              distributed_at=registered - timedelta(days=rng.randint(2, 20)), registered_at=registered, patient_id=patient.id,
              status=KitStatus.registered if state in ("kit_registered", "sample_collected", "cartridge_registered") else KitStatus.used)
    db.add(kit)
    db.flush()
    screening = Screening(screening_code=ctx.code("SCR-26-"), patient_id=patient.id, kit_id=kit.id, organization_id=site.id,
                          barangay_id=patient.barangay_id, status=ScreeningStatus.kit_registered, registered_at=registered,
                          created_at=registered, updated_at=anchor)
    db.add(screening)
    db.flush()
    db.refresh(screening)

    if not db.scalar(select(Consent).where(Consent.patient_id == patient.id, Consent.organization_id == site.id,
                                           Consent.scope == ConsentScope.screening)):
        db.add(Consent(patient_id=patient.id, organization_id=site.id, grantee_name=site.name, scope=ConsentScope.screening,
                       granted_via="kit_registration", granted_at=registered))
    passport = dict(event_type="kaia_screening", screening_id=screening.id, event_date=registered.date(), title="KAIA Screening",
                    detail=f"Kit {kit.kit_code}", institution_name=site.name, status="In progress", source="kaia_platform", verified=True)

    if state != "kit_registered":
        screening.sample_collected_at = anchor if state in ("sample_collected", "cartridge_registered") else registered + timedelta(days=rng.randint(1, 2))
        screening.status = ScreeningStatus.sample_collected
    if state == "cartridge_registered":
        reader = ctx.readers[p["reader"]]
        cartridge = Cartridge(cartridge_code=ctx.code("KAIA-CAR-"), organization_id=site.id, status=CartridgeStatus.inserted,
                              lot_expiry=ctx.today + timedelta(days=240), sim_profile=SimProfile.auto)
        db.add(cartridge)
        db.flush()
        screening.cartridge_id, screening.reader_id = cartridge.id, reader.id
        screening.status = ScreeningStatus.cartridge_registered
        reader.current_cartridge_id = cartridge.id
    if state in ("pending_review", "released", "invalid_sample"):
        outcome_wanted = p.get("outcome", RT)
        profile = SimProfile.invalid if state == "invalid_sample" else p.get("profile") or OUTCOME_PROFILE[outcome_wanted]
        analyzed_at = anchor - timedelta(minutes=rng.randint(15, 90)) if state == "released" else anchor
        outcome = _analyze(ctx, screening, site_code, profile, analyzed_at, site_readers)
        if state == "invalid_sample":
            passport["status"] = "Sample could not be analyzed — new sample needed"
        elif state == "pending_review":
            screening.status = ScreeningStatus.pending_review
        else:
            assert outcome == outcome_wanted, f"Seed profile produced {outcome}, expected {outcome_wanted}"
            screening.status = ScreeningStatus.result_ready
            screening.reviewed_by_id, screening.reviewed_at, screening.released_at = worker.id, anchor, anchor
            screening.decision_trace = {**screening.decision_trace, "reviewed": True}
            db.flush()
            pathway = care.create_pathway(db, screening)
            passport["status"] = OUTCOME_PASSPORT_STATUS[outcome]
            passport["event_date"] = anchor.date()
            referral_state = p.get("referral")
            if referral_state:
                if p.get("cancelled_first"):
                    _referral(ctx, pathway, screening, ReferralStatus.cancelled, anchor + timedelta(days=1),
                              site_worker=worker, dest_worker=ctx.staff["liza.cruz"])
                ref_at = ctx.now - timedelta(days=p["ref_days"], hours=rng.randint(1, 5)) if "ref_days" in p else anchor + timedelta(days=rng.randint(1, 6))
                _referral(ctx, pathway, screening, referral_state, ref_at, appt_in=p.get("appt_in"),
                          site_worker=worker, dest_worker=ctx.staff["liza.cruz"])
            if p.get("latest", True):
                notify(db, patient.user_id, "Your KAIA screening result is ready",
                       "Open KAIA to view your result and recommended next steps.", "result", f"/app/results/{screening.id}")
                if outcome == RT:
                    upsert_passport_event(db, patient.id, event_type="routine_recall", screening_id=screening.id,
                                          event_date=pathway.due_date, title="Next Routine Screening",
                                          detail="Recommended routine screening interval", institution_name=site.name,
                                          status="Upcoming", source="kaia_platform", verified=False)
    upsert_passport_event(db, patient.id, **passport)
    db.flush()
    return screening


LATEST_TEMPLATES = {
    "BCHO": [
        ("kit_registered", {"days": 0}), ("kit_registered", {"days": 4}),
        ("sample_collected", {"days": 0}), ("sample_collected", {"days": 0}), ("sample_collected", {"days": 0}),
        ("sample_collected", {"days": 0}), ("sample_collected", {"days": 1}), ("sample_collected", {"days": 2}),
        ("cartridge_registered", {"days": 0, "reader": "KAIA-RDR-001"}),
        ("pending_review", {"days": 0, "profile": SimProfile.negative}),
        ("pending_review", {"days": 0, "profile": SimProfile.hpv_16_18}),
        ("invalid_sample", {"days": 6}),
        *[("released", {"outcome": FU, "days": d}) for d in (3, 9, 14, 21, 33, 45)],
        ("released", {"outcome": FU, "days": 12, "referral": ReferralStatus.created, "ref_days": 8}),
        ("released", {"outcome": FU, "days": 26, "referral": ReferralStatus.created, "ref_days": 19}),
        ("released", {"outcome": FU, "days": 18, "referral": ReferralStatus.scheduled, "ref_days": 15, "appt_in": 6}),
        ("released", {"outcome": FU, "days": 40, "referral": ReferralStatus.missed, "ref_days": 36}),
        ("released", {"outcome": FU, "days": 24, "referral": ReferralStatus.attended, "ref_days": 20}),
        ("released", {"outcome": PR, "days": 2}), ("released", {"outcome": PR, "days": 5}),
        ("released", {"outcome": PR, "days": 7, "referral": ReferralStatus.scheduled, "ref_days": 6, "appt_in": 3}),
        ("released", {"outcome": RT, "days": 0}), ("released", {"outcome": RT, "days": 1}),
        ("released", {"outcome": RT, "days": 11, "revoke": True}), ("released", {"outcome": RT, "days": 30}),
        *[("released", {"outcome": FU, "days": d, "referral": ReferralStatus.completed}) for d in (60, 85, 120)],
    ],
    "KPP": [
        ("kit_registered", {"days": 1}), ("sample_collected", {"days": 0}),
        *[("released", {"outcome": RT, "days": d}) for d in (3, 16, 40, 70)],
        ("released", {"outcome": FU, "days": 10, "referral": ReferralStatus.scheduled, "ref_days": 9, "appt_in": 2}),
        ("released", {"outcome": FU, "days": 95, "referral": ReferralStatus.completed}),
    ],
    "KWHC": [
        ("sample_collected", {"days": 0}),
        *[("released", {"outcome": RT, "days": d}) for d in (2, 8, 22, 47, 66)],
        ("released", {"outcome": PR, "days": 50, "referral": ReferralStatus.completed}),
        ("released", {"outcome": FU, "days": 4, "referral": ReferralStatus.created, "ref_days": 3}),
    ],
}


def seed_screenings(ctx: Ctx, patients: list[PatientProfile]) -> int:
    assignments: list[tuple[PatientProfile, str, str, dict]] = []
    index = 0
    for site, templates in LATEST_TEMPLATES.items():
        for state, params in templates:
            assignments.append((patients[index], site, state, params))
            index += 1
    assert index == len(patients) == 49

    # 51 older, finalized screenings for the same women (earlier screening history)
    older_states = [("released", {"outcome": RT})] * 45 + [("released", {"outcome": FU, "referral": ReferralStatus.completed})] * 4 \
        + [("released", {"outcome": FU, "referral": ReferralStatus.completed, "cancelled_first": True})] + [("invalid_sample", {})]
    ctx.rng.shuffle(older_states)
    site_of = {p.id: site for p, site, _, _ in assignments}
    count = 0
    for i, (state, params) in enumerate(older_states):
        patient = patients[i % len(patients)]
        days_back = ctx.rng.randint(150, 330) if i < len(patients) else ctx.rng.randint(380, 520)
        make_screening(ctx, patient, site_of[patient.id], state, {**params, "days": days_back, "latest": False})
        count += 1

    for patient, site, state, params in assignments:
        screening = make_screening(ctx, patient, site, state, params)
        if params.get("revoke"):
            consent = ctx.db.scalar(select(Consent).where(Consent.patient_id == patient.id,
                                                          Consent.organization_id == ctx.orgs[site].id,
                                                          Consent.scope == ConsentScope.screening))
            consent.status, consent.revoked_at = ConsentStatus.revoked, ctx.now - timedelta(days=1)
        count += 1
        _ = screening
    return count


def seed_stock(ctx: Ctx) -> None:
    db, o = ctx.db, ctx.orgs
    for site, batch, n in (("BCHO", "CB-2026-06-A", 24), ("KPP", "CB-2026-08-P", 10), ("KWHC", "CB-2026-07-W", 12)):
        for _ in range(n):
            db.add(Cartridge(cartridge_code=ctx.code("KAIA-CAR-"), batch_id=ctx.batches[batch].id, organization_id=o[site].id,
                             status=CartridgeStatus.in_stock, lot_expiry=ctx.batches[batch].expiry_date, sim_profile=SimProfile.auto))
    names = list(ctx.barangays)
    for _ in range(18):
        db.add(Kit(kit_code=ctx.code("K26-", reserved=("K26-00921",)), batch_id=ctx.batches["KB-2026-07-A"].id,
                   organization_id=o["BCHO"].id, status=KitStatus.distributed, barangay_id=ctx.barangays[ctx.rng.choice(names)].id,
                   distributed_at=ctx.now - timedelta(days=ctx.rng.randint(1, 60))))
    for site, batch, n in (("BCHO", "KB-2026-07-A", 30), ("KPP", "KB-2026-08-P", 10), ("KWHC", "KB-2026-05-W", 10)):
        for _ in range(n):
            db.add(Kit(kit_code=ctx.code("K26-", reserved=("K26-00921",)), batch_id=ctx.batches[batch].id,
                       organization_id=o[site].id, status=KitStatus.in_stock))
    db.flush()


def seed_program_aggregates(ctx: Ctx) -> dict:
    """Imported de-identified history, computed so program totals match the reference figures exactly."""
    db = ctx.db
    bcho = ctx.orgs["BCHO"]

    targets: dict[str, dict] = {name: dict(d) for name, d in SPECIAL_BARANGAYS.items()}
    others = [name for name, *_ in OTHER_BARANGAYS]
    w = [eligible * factor for _, eligible, factor, _ in OTHER_BARANGAYS]
    special_sum = {m: sum(d[m] for d in SPECIAL_BARANGAYS.values()) for m in METRICS}
    split = {m: apportion(PROGRAM_TOTALS[m] - special_sum[m], w) for m in ("kits_distributed", "samples_returned", "valid_screenings")}
    split["follow_up_required"] = apportion(PROGRAM_TOTALS["follow_up_required"] - special_sum["follow_up_required"],
                                            [float(v) for v in split["valid_screenings"]])
    split["follow_up_completed"] = apportion(PROGRAM_TOTALS["follow_up_completed"] - special_sum["follow_up_completed"],
                                             [float(v) for v in split["follow_up_required"]])
    for i, (name, _, _, avg_days) in enumerate(OTHER_BARANGAYS):
        targets[name] = {m: split[m][i] for m in METRICS} | {"avg_days": avg_days}

    live = analytics.collect(db, bcho.id)
    live_by_name = {name: live.by_barangay.get(ctx.barangays[name].id, Counter()) for name in targets}

    # Keep baseline unresolved non-negative by moving follow-up-required between barangays with slack.
    def slack(name: str) -> int:
        t, lv = targets[name], live_by_name[name]
        return (t["follow_up_required"] - t["follow_up_completed"]) - (lv["follow_up_required"] - lv["follow_up_completed"])

    for name in targets:
        while slack(name) < 0:
            donors = sorted((n for n in others if n != name and slack(n) > 1), key=slack, reverse=True)
            if not donors:
                break
            targets[name]["follow_up_required"] += 1
            targets[donors[0]]["follow_up_required"] -= 1

    first = date(2025, 1, 1)
    months: list[date] = []
    cursor = first
    this_month = date(ctx.today.year, ctx.today.month, 1)
    while cursor < this_month:
        months.append(cursor)
        cursor = date(cursor.year + (cursor.month // 12), cursor.month % 12 + 1, 1)
    n = len(months)
    ramp = [0.55 + 0.9 * (i / max(1, n - 1)) + ctx.rng.uniform(-0.08, 0.08) for i in range(n)]
    decay = [1.0] * n
    for k, factor in zip(range(1, 4), (0.8, 0.55, 0.3)):
        if n - k >= 0:
            decay[n - k] = factor

    for name, target in targets.items():
        lv = live_by_name[name]
        baseline = {m: max(0, target[m] - lv[m]) for m in METRICS}
        per_month = {m: apportion(baseline[m], ramp) for m in METRICS if m != "follow_up_completed"}
        req = per_month["follow_up_required"]
        done = apportion(baseline["follow_up_completed"], [r * d for r, d in zip(req, decay)])
        overflow = 0
        for i in range(n):
            if done[i] > req[i]:
                overflow += done[i] - req[i]
                done[i] = req[i]
        for i in range(n):
            if not overflow:
                break
            take = min(req[i] - done[i], overflow)
            done[i] += take
            overflow -= take
        for i, month in enumerate(months):
            values = {m: per_month[m][i] for m in per_month} | {"follow_up_completed": done[i]}
            if not any(values.values()):
                continue
            days = sum(max(3, target["avg_days"] + ctx.rng.randint(-5, 5)) for _ in range(done[i]))
            db.add(ProgramAggregate(organization_id=bcho.id, barangay_id=ctx.barangays[name].id, month=month,
                                    total_days_to_follow_up=days, **values))
    db.flush()
    return analytics.summary(analytics.collect(db, bcho.id))


def seed_activity(ctx: Ctx) -> None:
    """Background audit trail and staff notifications so dashboards look lived-in."""
    db = ctx.db
    ana, liza, ramon = ctx.staff["ana.reyes"], ctx.staff["liza.cruz"], ctx.staff["ramon.bautista"]
    screenings = list(db.scalars(select(Screening).where(Screening.organization_id == ctx.orgs["BCHO"].id).limit(25)))
    for i, s in enumerate(screenings):
        at = ctx.now - timedelta(hours=ctx.rng.randint(1, 96))
        db.add(AuditLog(timestamp=at, user_id=ana.id, user_label=ana.email, role=ana.role, organization_id=ana.organization_id,
                        institution_name=ctx.orgs["BCHO"].name, action="screening.view" if i % 3 else "screening.result_view",
                        resource_type="screening", resource_id=str(s.id), subject_patient_id=s.patient_id, ip_address="10.20.4.18"))
    for user, org in ((ana, "BCHO"), (liza, "KWHC"), (ramon, "BCHO"), (ctx.staff["sysadmin"], None)):
        db.add(AuditLog(timestamp=user.last_login_at, user_id=user.id, user_label=user.email, role=user.role,
                        organization_id=user.organization_id, institution_name=ctx.orgs[org].name if org else None,
                        action="auth.login", resource_type="user", resource_id=str(user.id), ip_address="10.20.4.11"))
    notify(db, ana.id, "2 results awaiting your review", "KAIA Vision and the Risk Engine finished analyzing 2 samples.",
           "review", "/portal/queue")
    notify(db, ana.id, "Follow-up at risk", "One follow-up has stayed unscheduled for over 3 weeks. Outreach is recommended.",
           "continuity", "/portal/follow-ups")
    notify(db, liza.id, "Incoming referrals", "You have referrals awaiting scheduling from Batangas City Health Office.",
           "referral", "/portal/referrals")
    notify(db, ramon.id, "Low stock: KB-2026-03-B", "Only 40 KAIA Kits remain in the barangay health station batch.",
           "inventory", "/institution/inventory")
    notify(db, ramon.id, "Program gap detected", "Screening participation in Barangay San Isidro is well below the city average.",
           "analytics", "/institution/care-gaps")


def seed_database(db: Session, reset: bool = False) -> dict:
    if reset:
        wipe(db)
    elif db.scalar(select(func.count(Organization.id))):
        return {"skipped": True, "reason": "Database already contains data (use --reset)"}

    now = datetime.now(UTC)
    day_start, _ = local_day_bounds()
    ctx = Ctx(db=db, rng=random.Random(2026), now=now, today=local_today(), day_start=day_start,
              pw_hash=hash_password(DEMO_PASSWORD))
    seed_organizations(ctx)
    seed_barangays(ctx)
    seed_configuration(ctx)
    seed_devices(ctx)
    seed_staff(ctx)
    seed_maria(ctx)
    patients = seed_patients(ctx)
    screening_count = seed_screenings(ctx, patients)
    seed_stock(ctx)
    summary = seed_program_aggregates(ctx)
    seed_activity(ctx)
    db.commit()
    return {
        "organizations": len(ctx.orgs),
        "readers": len(ctx.readers),
        "patients": len(patients) + 1,
        "screenings": screening_count,
        "program_summary": summary,
        "demo_password": DEMO_PASSWORD,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed KAIA with synthetic demo data")
    parser.add_argument("--reset", action="store_true", help="wipe all data before seeding")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = seed_database(db, reset=args.reset)
    if result.get("skipped"):
        print(f"Seed skipped: {result['reason']}")
        return
    s = result["program_summary"]
    print(f"Seeded {result['organizations']} organizations, {result['readers']} readers, "
          f"{result['patients']} synthetic patients, {result['screenings']} screenings.")
    print(f"Program (BCHO): eligible {s['eligible_population']}, kits {s['kits_distributed']}, returned {s['samples_returned']}, "
          f"valid {s['valid_screenings']}, follow-up required {s['follow_up_required']}, completed {s['follow_up_completed']}.")
    print(f"All demo accounts use the password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
