import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow
from app.models.enums import ScreeningStatus


class Barangay(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "barangays"

    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(100))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    eligible_population: Mapped[int] = mapped_column(Integer)


class Screening(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "screenings"

    screening_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    kit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kits.id"), unique=True)
    cartridge_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cartridges.id"), unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    reader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("readers.id"), index=True)
    barangay_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("barangays.id"), index=True)

    status: Mapped[str] = mapped_column(String(32), default=ScreeningStatus.kit_registered, index=True)
    analysis_stage: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str | None] = mapped_column(String(32), index=True)
    decision_trace: Mapped[dict | None] = mapped_column(JSON)  # risk-engine explanation (no PII)

    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sample_collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analysis_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analysis_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    review_notes: Mapped[str | None] = mapped_column(EncryptedString)

    patient: Mapped["PatientProfile"] = relationship()  # noqa: F821
    kit: Mapped["Kit"] = relationship()  # noqa: F821
    cartridge: Mapped["Cartridge | None"] = relationship()  # noqa: F821
    organization: Mapped["Organization"] = relationship()  # noqa: F821
    reader: Mapped["Reader | None"] = relationship()  # noqa: F821
    barangay: Mapped[Barangay | None] = relationship()
    assay_result: Mapped["AssayResult | None"] = relationship(back_populates="screening", uselist=False)
    care_pathway: Mapped["CarePathway | None"] = relationship(back_populates="screening", uselist=False)  # noqa: F821


class AssayResult(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "assay_results"

    screening_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("screenings.id", ondelete="CASCADE"), unique=True)
    reader_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("readers.id"))
    control_valid: Mapped[bool] = mapped_column(Boolean)
    hpv_signal: Mapped[str] = mapped_column(String(20))
    hpv_genotype: Mapped[str | None] = mapped_column(String(32))  # hpv_16_18 | other_high_risk
    secondary_marker: Mapped[str] = mapped_column(String(20))
    sample_quality: Mapped[str] = mapped_column(String(20))
    assay_confidence: Mapped[str] = mapped_column(String(20))
    image_path: Mapped[str] = mapped_column(String(300))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    screening: Mapped[Screening] = relationship(back_populates="assay_result")
    analyses: Mapped[list["AIAnalysis"]] = relationship(back_populates="assay_result", order_by="AIAnalysis.created_at")


class ModelVersion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "model_versions"

    name: Mapped[str] = mapped_column(String(80))
    model_type: Mapped[str] = mapped_column(String(20), index=True)
    version: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    released_at: Mapped[date] = mapped_column(Date)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AIAnalysis(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_analyses"

    assay_result_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assay_results.id", ondelete="CASCADE"), index=True)
    model_version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("model_versions.id"))
    model_version: Mapped[str] = mapped_column(String(64))
    analysis_type: Mapped[str] = mapped_column(String(20))  # vision
    image_url: Mapped[str] = mapped_column(String(300))  # storage path; served only through signed URLs
    regions: Mapped[list] = mapped_column(JSON, default=list)
    signal_intensity: Mapped[dict] = mapped_column(JSON, default=dict)
    control_validity: Mapped[bool] = mapped_column(Boolean)
    prediction: Mapped[str] = mapped_column(String(64))
    confidence: Mapped[str] = mapped_column(String(20))
    confidence_score: Mapped[float] = mapped_column(Float)
    pipeline: Mapped[list] = mapped_column(JSON, default=list)

    assay_result: Mapped[AssayResult] = relationship(back_populates="analyses")


class RiskRule(UUIDMixin, TimestampMixin, Base):
    """Configurable clinical decision-support rule, evaluated in ascending priority order."""

    __tablename__ = "risk_rules"

    pathway_key: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer)
    conditions: Mapped[dict] = mapped_column(JSON)
    outcome: Mapped[str] = mapped_column(String(32))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class PathwayConfig(UUIDMixin, TimestampMixin, Base):
    """What KAIA Care recommends for each screening outcome."""

    __tablename__ = "pathway_configs"

    pathway_key: Mapped[str] = mapped_column(String(64), index=True)
    outcome: Mapped[str] = mapped_column(String(32))
    recommended_action: Mapped[str] = mapped_column(String(200))
    referral_type: Mapped[str | None] = mapped_column(String(40))
    timeframe_days: Mapped[int] = mapped_column(Integer)
    patient_message: Mapped[str] = mapped_column(Text)
    next_step_message: Mapped[str] = mapped_column(Text)
    required_service: Mapped[str | None] = mapped_column(String(64))


class ProgramAggregate(UUIDMixin, TimestampMixin, Base):
    """De-identified monthly program counts imported from pre-platform records (no PII)."""

    __tablename__ = "program_aggregates"

    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    barangay_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("barangays.id"), index=True)
    month: Mapped[date] = mapped_column(Date, index=True)
    kits_distributed: Mapped[int] = mapped_column(Integer, default=0)
    samples_returned: Mapped[int] = mapped_column(Integer, default=0)
    valid_screenings: Mapped[int] = mapped_column(Integer, default=0)
    follow_up_required: Mapped[int] = mapped_column(Integer, default=0)
    follow_up_completed: Mapped[int] = mapped_column(Integer, default=0)
    total_days_to_follow_up: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(40), default="historical_import")
