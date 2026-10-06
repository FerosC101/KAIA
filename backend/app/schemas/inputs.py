"""Strict request schemas. Unknown fields are rejected (extra='forbid') and inputs are constrained."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.models.enums import (
    ConsentScope,
    InventoryItemType,
    InventoryStatus,
    ModelStatus,
    ModelType,
    OrgType,
    ReaderStatus,
    ReferralStatus,
    Role,
    ScreeningOutcome,
    SimProfile,
)

Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=32, pattern=r"^[A-Za-z0-9\-]+$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 \-]{7,20}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _password_strength(value: str) -> str:
    if len(value) < 10 or not re.search(r"[A-Za-z]", value) or not re.search(r"[0-9]", value):
        raise ValueError("Password must be at least 10 characters and include letters and numbers")
    return value


# --- auth -------------------------------------------------------------------


class RegisterIn(StrictModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(max_length=128)]
    full_name: ShortText
    birth_date: date
    phone: Phone | None = None
    barangay_id: uuid.UUID | None = None
    privacy_notice_accepted: Literal[True]

    _pw = field_validator("password")(_password_strength)

    @field_validator("birth_date")
    @classmethod
    def plausible_birth_date(cls, value: date) -> date:
        age = (date.today() - value).days // 365
        if age < 18 or age > 100:
            raise ValueError("KAIA accounts are for adults aged 18 and above")
        return value


class LoginIn(StrictModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


# --- patient ----------------------------------------------------------------


class PatientUpdateIn(StrictModel):
    phone: Phone | None = None
    barangay_id: uuid.UUID | None = None
    distance_category: Literal["near", "moderate", "far"] | None = None
    preferred_language: Literal["en", "fil"] | None = None


class PassportRecordIn(StrictModel):
    event_type: Literal["hpv_vaccination", "routine_screening", "other_screening"]
    event_date: date
    title: ShortText
    institution_name: ShortText
    status: Literal["Completed", "Scheduled", "Pending"] = "Completed"

    @field_validator("event_date")
    @classmethod
    def not_far_future(cls, value: date) -> date:
        if value.year < 1990 or value.year > date.today().year + 5:
            raise ValueError("Date is out of range")
        return value


# --- kits & screenings --------------------------------------------------------


class KitRegisterIn(StrictModel):
    kit_code: Code
    site_organization_id: uuid.UUID
    consent_confirmed: Literal[True]


class ScreeningCreateIn(StrictModel):
    patient_code: Code
    kit_code: Code
    sample_collected: bool = True
    patient_consent_confirmed: Literal[True]


class CartridgeRegisterIn(StrictModel):
    cartridge_code: Code
    reader_code: Code
    sim_profile: SimProfile | None = None


class ReviewIn(StrictModel):
    override_outcome: ScreeningOutcome | None = None
    notes: Notes | None = None


class StartAnalysisIn(StrictModel):
    screening_id: uuid.UUID


# --- care -------------------------------------------------------------------


class ReferralCreateIn(StrictModel):
    screening_id: uuid.UUID
    destination_org_id: uuid.UUID
    preferred_schedule: date | None = None
    notes: Notes | None = None
    patient_consent_confirmed: Literal[True]


class ReferralUpdateIn(StrictModel):
    status: ReferralStatus
    scheduled_for: datetime | None = None
    notes: Notes | None = None
    completion_outcome: Literal["return_to_routine_screening", "continuing_care_at_facility"] | None = None


class ReferralVerifyIn(StrictModel):
    token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=200)]


class FollowUpIn(StrictModel):
    referral_id: uuid.UUID
    event_type: Literal["reminder_sent", "outreach_contact", "attended"]
    notes: Notes | None = None


# --- privacy ----------------------------------------------------------------


class ConsentIn(StrictModel):
    scope: ConsentScope
    organization_id: uuid.UUID | None = None


# --- inventory --------------------------------------------------------------


class InventoryBatchIn(StrictModel):
    organization_id: uuid.UUID
    item_type: InventoryItemType
    batch_number: Code
    manufacture_date: date
    expiry_date: date
    quantity: int = Field(ge=0, le=100000)
    reorder_threshold: int = Field(default=50, ge=0, le=100000)
    location: ShortText


class InventoryUpdateIn(StrictModel):
    quantity_delta: int | None = Field(default=None, ge=-100000, le=100000)
    status: InventoryStatus | None = None
    location: ShortText | None = None
    reorder_threshold: int | None = Field(default=None, ge=0, le=100000)


# --- admin ------------------------------------------------------------------


class OrganizationIn(StrictModel):
    name: ShortText
    code: Code
    org_type: OrgType
    city: ShortText
    province: ShortText
    address: ShortText
    phone: Phone | None = None
    operating_hours: ShortText | None = None
    services: list[Annotated[str, StringConstraints(pattern=r"^[a-z_]{3,40}$")]] = []
    is_referral_partner: bool = True


class OrganizationUpdateIn(StrictModel):
    name: ShortText | None = None
    address: ShortText | None = None
    phone: Phone | None = None
    operating_hours: ShortText | None = None
    services: list[Annotated[str, StringConstraints(pattern=r"^[a-z_]{3,40}$")]] | None = None
    is_referral_partner: bool | None = None
    active: bool | None = None


class UserCreateIn(StrictModel):
    email: EmailStr
    full_name: ShortText
    role: Literal[Role.health_worker, Role.institution_admin, Role.system_admin]
    organization_id: uuid.UUID | None = None
    position: ShortText | None = None
    temporary_password: Annotated[str, StringConstraints(max_length=128)]

    _pw = field_validator("temporary_password")(_password_strength)


class UserUpdateIn(StrictModel):
    is_active: bool | None = None
    organization_id: uuid.UUID | None = None


class StaffCreateIn(StrictModel):
    email: EmailStr
    full_name: ShortText
    position: ShortText
    temporary_password: Annotated[str, StringConstraints(max_length=128)]

    _pw = field_validator("temporary_password")(_password_strength)


class StaffUpdateIn(StrictModel):
    active: bool | None = None
    position: ShortText | None = None


class ReaderCreateIn(StrictModel):
    reader_code: Code
    serial_number: Code
    organization_id: uuid.UUID
    location_name: ShortText
    firmware_version: Annotated[str, StringConstraints(pattern=r"^v\d+\.\d+\.\d+$")]


class ReaderUpdateIn(StrictModel):
    status: Literal[ReaderStatus.online, ReaderStatus.offline, ReaderStatus.maintenance] | None = None
    location_name: ShortText | None = None
    firmware_version: Annotated[str, StringConstraints(pattern=r"^v\d+\.\d+\.\d+$")] | None = None
    organization_id: uuid.UUID | None = None


class CartridgeGenerateIn(StrictModel):
    organization_id: uuid.UUID
    count: int = Field(ge=1, le=500)
    lot_expiry: date


class ModelVersionIn(StrictModel):
    name: ShortText
    model_type: ModelType
    version: Annotated[str, StringConstraints(pattern=r"^[0-9A-Za-z.\-]{1,32}$")]
    description: Notes
    metrics: dict[str, float] = {}
    status: Literal[ModelStatus.shadow, ModelStatus.retired] = ModelStatus.shadow


class RuleCondition(StrictModel):
    field: str
    op: Literal["eq", "ne", "in", "gte", "lte"]
    value: bool | float | int | str | list[str]


class RuleConditions(StrictModel):
    all: list[RuleCondition] = Field(max_length=10)


class RiskRuleIn(StrictModel):
    name: ShortText
    description: Notes
    priority: int = Field(ge=1, le=999)
    conditions: RuleConditions
    outcome: ScreeningOutcome
    active: bool = True


class RiskRuleUpdateIn(StrictModel):
    name: ShortText | None = None
    description: Notes | None = None
    priority: int | None = Field(default=None, ge=1, le=999)
    conditions: RuleConditions | None = None
    outcome: ScreeningOutcome | None = None
    active: bool | None = None


class RiskTestIn(StrictModel):
    control_valid: bool = True
    hpv_signal: Literal["detected", "not_detected", "indeterminate"]
    hpv_genotype: Literal["hpv_16_18", "other_high_risk", "none"] = "none"
    secondary_marker: Literal["detected", "not_detected", "indeterminate"] = "not_detected"
    sample_quality: Literal["good", "acceptable", "poor"] = "good"
    hpv_signal_intensity: float = Field(default=0.5, ge=0, le=1)
    prior_high_risk_result: bool = False
    prior_missed_follow_up: bool = False
    age_bracket: Literal["under-25", "25-29", "30-39", "40-49", "50-65", "65+"] = "30-39"


class PathwayConfigUpdateIn(StrictModel):
    recommended_action: ShortText | None = None
    timeframe_days: int | None = Field(default=None, ge=1, le=3650)
    patient_message: Notes | None = None
    next_step_message: Notes | None = None
