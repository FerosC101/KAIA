"""KAIA Care — structured care-pathway engine, referrals, appointments and follow-up tracking."""

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden
from app.models import (
    Appointment,
    CarePathway,
    Consent,
    FollowUp,
    HealthWorker,
    Organization,
    PathwayConfig,
    Referral,
    Screening,
    User,
)
from app.models.enums import (
    AppointmentStatus,
    ConsentScope,
    ConsentStatus,
    EventSource,
    FollowUpEventType,
    PathwayStage,
    PathwayStatus,
    ReferralPriority,
    ReferralStatus,
    ReferralType,
    Role,
    ScreeningOutcome,
)
from app.services.access import active_consent
from app.services.common import notify, unique_code, upsert_passport_event
from app.services.risk_engine import PATHWAY_KEY

ACTIVE_REFERRAL_STATUSES = {ReferralStatus.created, ReferralStatus.scheduled, ReferralStatus.attended, ReferralStatus.missed}

REFERRAL_TRANSITIONS: dict[str, set[str]] = {
    ReferralStatus.created: {ReferralStatus.scheduled, ReferralStatus.missed, ReferralStatus.cancelled},
    ReferralStatus.scheduled: {ReferralStatus.scheduled, ReferralStatus.attended, ReferralStatus.missed, ReferralStatus.cancelled},
    ReferralStatus.attended: {ReferralStatus.completed},
    ReferralStatus.missed: {ReferralStatus.scheduled, ReferralStatus.cancelled},
    ReferralStatus.completed: set(),
    ReferralStatus.cancelled: set(),
}
PATIENT_TRANSITIONS = {ReferralStatus.scheduled}

COMPLETION_OUTCOMES = {
    "return_to_routine_screening": "Confirmatory screening completed — return to routine screening",
    "continuing_care_at_facility": "Confirmatory screening completed — continuing care with facility",
}

FOLLOW_UP_STEPS = [
    (PathwayStage.screening_complete, "Screening complete"),
    (PathwayStage.follow_up_recommended, "Follow-up recommended"),
    (PathwayStage.find_care, "Find care"),
    (PathwayStage.referral_generated, "Referral generated"),
    (PathwayStage.appointment_scheduled, "Appointment"),
    (PathwayStage.confirmatory_screening, "Confirmatory screening"),
    (PathwayStage.care_completed, "Care completed"),
]
ROUTINE_STEPS = [
    (PathwayStage.screening_complete, "Screening complete"),
    (PathwayStage.routine_recall, "Routine screening recall"),
]

REFERRAL_TYPE_LABELS = {
    ReferralType.confirmatory_screening: "Confirmatory cervical-health screening",
    ReferralType.clinical_evaluation: "Priority clinical evaluation",
}


def _now() -> datetime:
    return datetime.now(UTC)


def is_follow_up(outcome: str | None) -> bool:
    return outcome in (ScreeningOutcome.follow_up_recommended, ScreeningOutcome.priority_follow_up)


def get_pathway_config(db: Session, outcome: str, pathway_key: str = PATHWAY_KEY) -> PathwayConfig:
    config = db.scalar(select(PathwayConfig).where(PathwayConfig.pathway_key == pathway_key, PathwayConfig.outcome == outcome))
    if config is None:
        raise RuntimeError(f"No pathway configuration for outcome '{outcome}'")
    return config


def facilities_for_service(db: Session, service: str | None) -> list[Organization]:
    orgs = db.scalars(select(Organization).where(Organization.active.is_(True), Organization.is_referral_partner.is_(True)))
    return [o for o in orgs if service is None or service in (o.services or [])]


def recommend_facility(db: Session, config: PathwayConfig, screening: Screening) -> Organization | None:
    candidates = facilities_for_service(db, config.required_service)
    if not candidates:
        return None

    def rank(org: Organization) -> tuple:
        return (
            "same_week_appointments" not in (org.services or []),
            org.org_type != "clinic",
            org.id != screening.organization_id,
            org.name,
        )

    return sorted(candidates, key=rank)[0]


def timeframe_label(days: int) -> str:
    if days >= 365:
        years = round(days / 365)
        return f"In {years} year{'s' if years > 1 else ''}"
    if days % 7 == 0:
        weeks = days // 7
        return f"Within {weeks} week{'s' if weeks > 1 else ''}"
    return f"Within {days} days"


# ---------------------------------------------------------------------------
# Pathway lifecycle
# ---------------------------------------------------------------------------


def create_pathway(db: Session, screening: Screening) -> CarePathway:
    config = get_pathway_config(db, screening.outcome)
    released = screening.released_at or _now()
    routine = screening.outcome == ScreeningOutcome.routine_screening
    facility = None if routine else recommend_facility(db, config, screening)
    pathway = CarePathway(
        screening_id=screening.id,
        patient_id=screening.patient_id,
        pathway_type=screening.outcome,
        current_stage=PathwayStage.routine_recall if routine else PathwayStage.find_care,
        status=PathwayStatus.completed if routine else PathwayStatus.active,
        recommended_action=config.recommended_action,
        referral_type=config.referral_type,
        timeframe_days=config.timeframe_days,
        due_date=released.date() + timedelta(days=config.timeframe_days),
        recommended_facility_id=facility.id if facility else None,
        completed_at=released if routine else None,
    )
    db.add(pathway)
    db.flush()
    return pathway


def active_referral(pathway: CarePathway) -> Referral | None:
    for referral in reversed(pathway.referrals):
        if referral.status != ReferralStatus.cancelled:
            return referral
    return None


def sync_pathway(pathway: CarePathway) -> None:
    if pathway.pathway_type == ScreeningOutcome.routine_screening:
        return
    referral = active_referral(pathway)
    if referral is None:
        pathway.current_stage, pathway.status = PathwayStage.find_care, PathwayStatus.active
    elif referral.status in (ReferralStatus.created, ReferralStatus.missed):
        pathway.current_stage, pathway.status = PathwayStage.appointment_scheduled, PathwayStatus.active
    elif referral.status == ReferralStatus.scheduled:
        pathway.current_stage, pathway.status = PathwayStage.confirmatory_screening, PathwayStatus.active
    elif referral.status == ReferralStatus.attended:
        pathway.current_stage, pathway.status = PathwayStage.care_completed, PathwayStatus.active
    elif referral.status == ReferralStatus.completed:
        pathway.current_stage, pathway.status = PathwayStage.care_completed, PathwayStatus.completed
        pathway.completed_at = pathway.completed_at or referral.status_changed_at


def pathway_steps(pathway: CarePathway) -> list[dict]:
    screening = pathway.screening
    released = screening.released_at
    if pathway.pathway_type == ScreeningOutcome.routine_screening:
        return [
            {"key": PathwayStage.screening_complete, "label": "Screening complete", "state": "done", "date": released},
            {"key": PathwayStage.routine_recall, "label": "Routine screening recall", "state": "upcoming", "date": pathway.due_date},
        ]
    referral = active_referral(pathway)
    appointment = referral.appointments[-1] if referral and referral.appointments else None
    dates = {
        PathwayStage.screening_complete: released,
        PathwayStage.follow_up_recommended: released,
        PathwayStage.find_care: referral.generated_at if referral else None,
        PathwayStage.referral_generated: referral.generated_at if referral else None,
        PathwayStage.appointment_scheduled: appointment.scheduled_for if appointment else None,
        PathwayStage.confirmatory_screening: _event_date(referral, FollowUpEventType.attended),
        PathwayStage.care_completed: pathway.completed_at,
    }
    keys = [k for k, _ in FOLLOW_UP_STEPS]
    current_index = keys.index(pathway.current_stage) if pathway.current_stage in keys else 2
    steps = []
    for index, (key, label) in enumerate(FOLLOW_UP_STEPS):
        if pathway.status == PathwayStatus.completed or index < current_index:
            state = "done"
        elif index == current_index:
            state = "current"
        else:
            state = "pending"
        note = None
        if key == PathwayStage.appointment_scheduled and referral and referral.status == ReferralStatus.missed:
            note = "Missed — please reschedule"
        steps.append({"key": key, "label": label, "state": state, "date": dates.get(key), "note": note})
    return steps


def _event_date(referral: Referral | None, event_type: str) -> datetime | None:
    if referral is None:
        return None
    for event in reversed(referral.follow_ups):
        if event.event_type == event_type and event.verified:
            return event.occurred_at
    return None


def facility_summary(org: Organization | None) -> dict | None:
    if org is None:
        return None
    return {
        "id": str(org.id),
        "name": org.name,
        "org_type": org.org_type,
        "address": org.address,
        "city": org.city,
        "phone": org.phone,
        "operating_hours": org.operating_hours,
        "services": org.services,
    }


def next_best_action(pathway: CarePathway) -> dict:
    referral = active_referral(pathway)
    facility = referral.destination_org if referral else pathway.recommended_facility
    base = {
        "stage": pathway.current_stage,
        "timeframe_label": timeframe_label(pathway.timeframe_days),
        "due_date": pathway.due_date,
        "facility": facility_summary(facility),
        "referral_id": str(referral.id) if referral else None,
        "referral_status": referral.status if referral else None,
    }
    if pathway.pathway_type == ScreeningOutcome.routine_screening:
        return {**base, "tone": "success", "title": "Continue routine screening",
                "description": "No follow-up is needed from this screening. KAIA will remind you when your next routine screening is due.",
                "timeframe_label": f"Next screening due {pathway.due_date.strftime('%B %Y')}", "actions": []}
    title = pathway.recommended_action
    tone = "priority" if pathway.pathway_type == ScreeningOutcome.priority_follow_up else "warning"
    if referral is None:
        return {**base, "tone": tone, "title": title,
                "description": "Choose a partner facility and generate a referral. Your referral can be scanned at the facility.",
                "actions": ["view_facility", "generate_referral"]}
    appointment = referral.appointments[-1] if referral.appointments else None
    if referral.status == ReferralStatus.created:
        return {**base, "tone": tone, "title": "Schedule your appointment",
                "description": f"Your referral to {referral.destination_org.name} is ready. Contact the facility and record your appointment date.",
                "actions": ["view_facility", "view_referral", "mark_scheduled"]}
    if referral.status == ReferralStatus.missed:
        return {**base, "tone": tone, "title": "Reschedule your appointment",
                "description": "Your last appointment was missed. It is not too late — please set a new appointment date.",
                "actions": ["view_facility", "view_referral", "mark_scheduled"]}
    if referral.status == ReferralStatus.scheduled and appointment:
        self_reported = any(e.event_type == FollowUpEventType.attended and not e.verified for e in referral.follow_ups)
        return {**base, "tone": "info", "title": f"Attend your appointment on {appointment.scheduled_for.strftime('%B %-d, %Y')}",
                "description": ("Thank you for letting us know you attended. The facility will confirm your visit."
                                if self_reported else f"Bring your KAIA referral QR code to {referral.destination_org.name}."),
                "appointment_at": appointment.scheduled_for,
                "actions": ["view_referral", "report_attended"] if not self_reported else ["view_referral"]}
    if referral.status == ReferralStatus.attended:
        return {**base, "tone": "info", "title": "Confirmatory screening in progress",
                "description": f"{referral.destination_org.name} will record when your follow-up care is complete.",
                "actions": ["view_referral"]}
    return {**base, "tone": "success", "title": "Follow-up care completed",
            "description": "You completed the recommended follow-up. Your KAIA Passport has been updated.",
            "actions": ["view_passport"]}


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------


def _source_for(actor: User) -> str:
    return EventSource.patient if actor.role == Role.patient else EventSource.health_worker


def ensure_consent(db: Session, patient_id, org: Organization, scope: str, via: str) -> None:
    if active_consent(db, patient_id, org.id, [scope]) is None:
        db.add(Consent(patient_id=patient_id, organization_id=org.id, grantee_name=org.name, scope=scope,
                       status=ConsentStatus.granted, granted_via=via))


def _notify_org_workers(db: Session, org_id, title: str, body: str, link: str) -> None:
    worker_user_ids = db.scalars(
        select(HealthWorker.user_id).where(HealthWorker.organization_id == org_id, HealthWorker.active.is_(True))
    )
    for uid in worker_user_ids:
        notify(db, uid, title, body, "referral", link)


def create_referral(
    db: Session,
    pathway: CarePathway,
    actor: User,
    destination: Organization,
    preferred_schedule: date | None,
    notes: str | None,
) -> Referral:
    if pathway.pathway_type == ScreeningOutcome.routine_screening:
        raise bad_request("Routine screening results do not require a referral")
    if pathway.status != PathwayStatus.active:
        raise conflict("This care pathway is already complete")
    existing = active_referral(pathway)
    if existing is not None and existing.status in ACTIVE_REFERRAL_STATUSES:
        raise conflict(f"An active referral ({existing.referral_code}) already exists for this screening")
    config = get_pathway_config(db, pathway.pathway_type)
    if config.required_service and config.required_service not in (destination.services or []):
        raise bad_request(f"{destination.name} does not offer the required service")

    screening = pathway.screening
    now = _now()
    referral = Referral(
        referral_code=unique_code(db, Referral, Referral.referral_code, "REF-26-"),
        patient_id=pathway.patient_id,
        screening_id=screening.id,
        care_pathway_id=pathway.id,
        source_org_id=screening.organization_id,
        destination_org_id=destination.id,
        referral_type=pathway.referral_type or ReferralType.confirmatory_screening,
        priority=ReferralPriority.priority if pathway.pathway_type == ScreeningOutcome.priority_follow_up else ReferralPriority.standard,
        generated_at=now,
        status_changed_at=now,
        preferred_schedule=preferred_schedule,
        status=ReferralStatus.created,
        clinical_notes=notes,
        created_by_id=actor.id,
    )
    db.add(referral)
    db.flush()
    pathway.referrals.append(referral)
    ensure_consent(db, pathway.patient_id, destination, ConsentScope.referral, "referral")
    db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.referral_created, occurred_at=now,
                    source=_source_for(actor), verified=True, recorded_by_id=actor.id))

    label = REFERRAL_TYPE_LABELS.get(referral.referral_type, "Clinical referral")
    upsert_passport_event(db, pathway.patient_id, event_type="referral", referral_id=referral.id,
                          event_date=now.date(), title="Clinical Referral", detail=label,
                          institution_name=destination.name, status="Created", source="kaia_platform", verified=True)
    upsert_passport_event(db, pathway.patient_id, event_type="confirmatory_screening", referral_id=referral.id,
                          event_date=pathway.due_date, title="Confirmatory Screening", detail=f"Recommended by {pathway.due_date.strftime('%b %-d, %Y')}",
                          institution_name=destination.name, status="Pending", source="kaia_platform", verified=False)

    patient_user_id = screening.patient.user_id
    if actor.role != Role.patient:
        notify(db, patient_user_id, "A referral was created for you",
               f"Your referral to {destination.name} is ready in KAIA Care.", "referral", "/app/care")
    _notify_org_workers(db, destination.id, "New incoming referral",
                        f"Referral {referral.referral_code} ({'priority' if referral.priority == 'priority' else 'standard'}) is awaiting scheduling.",
                        f"/portal/referrals/{referral.id}")
    sync_pathway(pathway)
    return referral


def transition_referral(
    db: Session,
    referral: Referral,
    actor: User,
    new_status: str,
    *,
    scheduled_for: datetime | None = None,
    notes: str | None = None,
    completion_outcome: str | None = None,
) -> Referral:
    allowed = REFERRAL_TRANSITIONS.get(referral.status, set())
    if new_status not in allowed:
        raise conflict(f"Cannot change referral from '{referral.status}' to '{new_status}'")
    if actor.role == Role.patient and new_status not in PATIENT_TRANSITIONS:
        raise forbidden("Only the facility can record this referral update")

    now = _now()
    source = _source_for(actor)
    verified = actor.role != Role.patient
    latest_appt = referral.appointments[-1] if referral.appointments else None
    passport_status = None

    if new_status == ReferralStatus.scheduled:
        if scheduled_for is None:
            raise bad_request("An appointment date is required")
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=UTC)
        if latest_appt is not None and latest_appt.status == AppointmentStatus.scheduled:
            latest_appt.status = AppointmentStatus.cancelled
        appt = Appointment(referral_id=referral.id, organization_id=referral.destination_org_id,
                           scheduled_for=scheduled_for, status=AppointmentStatus.scheduled, recorded_by_id=actor.id)
        db.add(appt)
        referral.appointments.append(appt)
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.appointment_scheduled, occurred_at=now,
                        notes=notes, source=source, verified=verified, recorded_by_id=actor.id))
        passport_status = "Scheduled"
    elif new_status == ReferralStatus.attended:
        if latest_appt is not None:
            latest_appt.status = AppointmentStatus.attended
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.attended, occurred_at=now,
                        notes=notes, source=source, verified=True, recorded_by_id=actor.id))
        passport_status = "Attended"
        upsert_passport_event(db, referral.patient_id, event_type="confirmatory_screening", referral_id=referral.id,
                              event_date=now.date(), title="Confirmatory Screening", detail="Visit confirmed by facility",
                              institution_name=referral.destination_org.name, status="In progress",
                              source="facility_record", verified=True)
    elif new_status == ReferralStatus.missed:
        if latest_appt is not None:
            latest_appt.status = AppointmentStatus.missed
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.missed, occurred_at=now,
                        notes=notes, source=source, verified=True, recorded_by_id=actor.id))
        passport_status = "Missed"
        notify(db, referral.patient.user_id, "Let's reschedule your follow-up",
               "Your appointment was marked as missed. You can set a new date in KAIA Care.", "referral", "/app/care")
    elif new_status == ReferralStatus.completed:
        if completion_outcome not in COMPLETION_OUTCOMES:
            raise bad_request(f"completion_outcome must be one of {sorted(COMPLETION_OUTCOMES)}")
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.confirmatory_screening_done, occurred_at=now,
                        notes=notes, source=source, verified=True, recorded_by_id=actor.id))
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.care_completed, occurred_at=now,
                        source=source, verified=True, recorded_by_id=actor.id))
        passport_status = "Completed"
        upsert_passport_event(db, referral.patient_id, event_type="confirmatory_screening", referral_id=referral.id,
                              event_date=now.date(), title="Confirmatory Screening", detail=COMPLETION_OUTCOMES[completion_outcome],
                              institution_name=referral.destination_org.name, status="Completed",
                              source="facility_record", verified=True)
        notify(db, referral.patient.user_id, "Follow-up care completed",
               "Your follow-up has been recorded as complete. Your KAIA Passport is up to date.", "care", "/app/passport")
    elif new_status == ReferralStatus.cancelled:
        if latest_appt is not None and latest_appt.status == AppointmentStatus.scheduled:
            latest_appt.status = AppointmentStatus.cancelled
        db.add(FollowUp(referral_id=referral.id, event_type=FollowUpEventType.cancelled, occurred_at=now,
                        notes=notes, source=source, verified=verified, recorded_by_id=actor.id))
        passport_status = "Cancelled"
        upsert_passport_event(db, referral.patient_id, event_type="confirmatory_screening", referral_id=referral.id,
                              event_date=now.date(), title="Confirmatory Screening", detail="Referral cancelled",
                              institution_name=referral.destination_org.name, status="Cancelled",
                              source="kaia_platform", verified=True)

    referral.status = new_status
    referral.status_changed_at = now
    if passport_status:
        detail = None
        if new_status == ReferralStatus.scheduled and scheduled_for:
            detail = f"Appointment {scheduled_for.strftime('%b %-d, %Y')}"
        fields = {"status": passport_status, "verified": verified or new_status != ReferralStatus.scheduled}
        if detail:
            fields["detail"] = detail
        if new_status != ReferralStatus.scheduled:
            fields["source"] = "facility_record"
        upsert_passport_event(db, referral.patient_id, event_type="referral", referral_id=referral.id, **fields)
    sync_pathway(referral.care_pathway)
    return referral


def default_appointment_time(day: date) -> datetime:
    return datetime.combine(day, time(9, 0), tzinfo=UTC)
