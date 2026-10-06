import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.db.base import Base, TimestampMixin, UUIDMixin, utcnow
from app.models.enums import PathwayStatus, ReferralStatus


class CarePathway(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "care_pathways"

    screening_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("screenings.id", ondelete="CASCADE"), unique=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    pathway_type: Mapped[str] = mapped_column(String(32))  # mirrors screening outcome
    current_stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default=PathwayStatus.active, index=True)
    recommended_action: Mapped[str] = mapped_column(String(200))
    referral_type: Mapped[str | None] = mapped_column(String(40))
    timeframe_days: Mapped[int] = mapped_column(Integer)
    due_date: Mapped[date] = mapped_column(Date)
    recommended_facility_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    screening: Mapped["Screening"] = relationship(back_populates="care_pathway")  # noqa: F821
    recommended_facility: Mapped["Organization | None"] = relationship()  # noqa: F821
    referrals: Mapped[list["Referral"]] = relationship(back_populates="care_pathway", order_by="Referral.generated_at")


class Referral(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "referrals"

    referral_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    screening_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("screenings.id"), index=True)
    care_pathway_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("care_pathways.id"), index=True)
    source_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    destination_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    referral_type: Mapped[str] = mapped_column(String(40))
    priority: Mapped[str] = mapped_column(String(20))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    preferred_schedule: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default=ReferralStatus.created, index=True)
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    clinical_notes: Mapped[str | None] = mapped_column(EncryptedString)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    patient: Mapped["PatientProfile"] = relationship()  # noqa: F821
    screening: Mapped["Screening"] = relationship()  # noqa: F821
    care_pathway: Mapped[CarePathway] = relationship(back_populates="referrals")
    source_org: Mapped["Organization"] = relationship(foreign_keys=[source_org_id])  # noqa: F821
    destination_org: Mapped["Organization"] = relationship(foreign_keys=[destination_org_id])  # noqa: F821
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="referral", order_by="Appointment.scheduled_for")
    follow_ups: Mapped[list["FollowUp"]] = relationship(back_populates="referral", order_by="FollowUp.occurred_at")


class Appointment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "appointments"

    referral_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("referrals.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20))
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    referral: Mapped[Referral] = relationship(back_populates="appointments")


class FollowUp(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "follow_ups"

    referral_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("referrals.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    notes: Mapped[str | None] = mapped_column(EncryptedString)
    source: Mapped[str] = mapped_column(String(20))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    referral: Mapped[Referral] = relationship(back_populates="follow_ups")


class PassportEvent(UUIDMixin, TimestampMixin, Base):
    """KAIA Passport entry: reproductive-health *screening* history only — not a full EMR."""

    __tablename__ = "passport_events"

    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True)
    event_date: Mapped[date] = mapped_column(Date)
    event_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(String(300))
    institution_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(80))
    source: Mapped[str] = mapped_column(String(40))  # kaia_platform | facility_record | self_reported
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    screening_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("screenings.id", ondelete="SET NULL"))
    referral_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("referrals.id", ondelete="SET NULL"))
