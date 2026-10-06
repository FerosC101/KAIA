"""Domain vocabularies. Stored as strings (not native PG enums) to keep migrations simple."""

from enum import StrEnum


class Role(StrEnum):
    patient = "patient"
    health_worker = "health_worker"
    institution_admin = "institution_admin"
    system_admin = "system_admin"


class OrgType(StrEnum):
    lgu_health_office = "lgu_health_office"
    pharmacy = "pharmacy"
    clinic = "clinic"


class ReaderStatus(StrEnum):
    online = "online"
    analyzing = "analyzing"
    offline = "offline"
    maintenance = "maintenance"


class KitStatus(StrEnum):
    in_stock = "in_stock"
    distributed = "distributed"
    registered = "registered"
    used = "used"
    expired = "expired"


class CartridgeStatus(StrEnum):
    in_stock = "in_stock"
    assigned = "assigned"
    inserted = "inserted"
    processed = "processed"
    expired = "expired"


class ScreeningStatus(StrEnum):
    kit_registered = "kit_registered"
    sample_collected = "sample_collected"
    cartridge_registered = "cartridge_registered"
    analyzing = "analyzing"
    pending_review = "pending_review"
    result_ready = "result_ready"
    invalid_sample = "invalid_sample"


class ScreeningOutcome(StrEnum):
    routine_screening = "routine_screening"
    follow_up_recommended = "follow_up_recommended"
    priority_follow_up = "priority_follow_up"


class SignalState(StrEnum):
    detected = "detected"
    not_detected = "not_detected"
    indeterminate = "indeterminate"


class PathwayStage(StrEnum):
    screening_complete = "screening_complete"
    follow_up_recommended = "follow_up_recommended"
    find_care = "find_care"
    referral_generated = "referral_generated"
    appointment_scheduled = "appointment_scheduled"
    confirmatory_screening = "confirmatory_screening"
    care_completed = "care_completed"
    routine_recall = "routine_recall"


class PathwayStatus(StrEnum):
    active = "active"
    completed = "completed"
    closed = "closed"


class ReferralStatus(StrEnum):
    created = "created"
    scheduled = "scheduled"
    attended = "attended"
    completed = "completed"
    missed = "missed"
    cancelled = "cancelled"


class ReferralPriority(StrEnum):
    standard = "standard"
    priority = "priority"


class ReferralType(StrEnum):
    confirmatory_screening = "confirmatory_screening"
    clinical_evaluation = "clinical_evaluation"


class AppointmentStatus(StrEnum):
    scheduled = "scheduled"
    attended = "attended"
    missed = "missed"
    cancelled = "cancelled"


class FollowUpEventType(StrEnum):
    referral_created = "referral_created"
    appointment_scheduled = "appointment_scheduled"
    reminder_sent = "reminder_sent"
    outreach_contact = "outreach_contact"
    attended = "attended"
    missed = "missed"
    confirmatory_screening_done = "confirmatory_screening_done"
    care_completed = "care_completed"
    cancelled = "cancelled"


class EventSource(StrEnum):
    patient = "patient"
    health_worker = "health_worker"
    system = "system"


class ConsentScope(StrEnum):
    screening = "screening"
    referral = "referral"
    passport = "passport"
    anonymous_statistics = "anonymous_statistics"


class ConsentStatus(StrEnum):
    granted = "granted"
    revoked = "revoked"


class InventoryItemType(StrEnum):
    kit = "kit"
    cartridge = "cartridge"
    reader = "reader"


class InventoryStatus(StrEnum):
    available = "available"
    quarantined = "quarantined"
    expired = "expired"
    depleted = "depleted"


class ModelType(StrEnum):
    vision = "vision"
    risk = "risk"
    continuity = "continuity"


class ModelStatus(StrEnum):
    active = "active"
    shadow = "shadow"
    retired = "retired"


class SimProfile(StrEnum):
    """Prototype-only: which synthetic assay the simulated reader should produce."""

    auto = "auto"
    negative = "negative"
    hpv_other_high_risk = "hpv_other_high_risk"
    hpv_16_18 = "hpv_16_18"
    hpv_with_marker = "hpv_with_marker"
    invalid = "invalid"
