import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.db.base import Base, TimestampMixin, UUIDMixin


class Organization(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), unique=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    org_type: Mapped[str] = mapped_column(String(40))
    city: Mapped[str] = mapped_column(String(100))
    province: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(40))
    operating_hours: Mapped[str | None] = mapped_column(String(120))
    services: Mapped[list] = mapped_column(JSON, default=list)
    is_referral_partner: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    health_workers: Mapped[list["HealthWorker"]] = relationship(back_populates="organization")
    readers: Mapped[list["Reader"]] = relationship(back_populates="organization")  # noqa: F821


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(40), index=True)
    full_name: Mapped[str] = mapped_column(EncryptedString)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"), index=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    organization: Mapped[Organization | None] = relationship()
    patient_profile: Mapped["PatientProfile | None"] = relationship(back_populates="user", uselist=False)
    health_worker: Mapped["HealthWorker | None"] = relationship(back_populates="user", uselist=False)


class PatientProfile(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "patient_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    patient_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    birth_date: Mapped[str | None] = mapped_column(EncryptedString)  # ISO date, encrypted at rest
    age_bracket: Mapped[str] = mapped_column(String(16))
    phone: Mapped[str | None] = mapped_column(EncryptedString)
    address: Mapped[str | None] = mapped_column(EncryptedString)
    barangay_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("barangays.id"), index=True)
    city: Mapped[str] = mapped_column(String(100), default="Batangas City")
    preferred_language: Mapped[str] = mapped_column(String(20), default="en")
    distance_category: Mapped[str] = mapped_column(String(20), default="near")  # near | moderate | far

    user: Mapped[User] = relationship(back_populates="patient_profile")
    barangay: Mapped["Barangay | None"] = relationship()  # noqa: F821


class HealthWorker(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "health_workers"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    position: Mapped[str] = mapped_column(String(80))
    employee_code: Mapped[str] = mapped_column(String(40), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="health_worker")
    organization: Mapped[Organization] = relationship(back_populates="health_workers")
