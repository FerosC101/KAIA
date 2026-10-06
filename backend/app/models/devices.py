import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import CartridgeStatus, InventoryStatus, KitStatus, ReaderStatus, SimProfile


class Reader(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "readers"

    reader_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    serial_number: Mapped[str] = mapped_column(String(64), unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    location_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=ReaderStatus.online)
    firmware_version: Mapped[str] = mapped_column(String(20))
    temperature_c: Mapped[float] = mapped_column(Float, default=24.0)
    last_calibration: Mapped[date] = mapped_column(Date)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_cartridge_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cartridges.id"))
    total_analyses: Mapped[int] = mapped_column(Integer, default=0)

    organization: Mapped["Organization"] = relationship(back_populates="readers")  # noqa: F821
    current_cartridge: Mapped["Cartridge | None"] = relationship(foreign_keys=[current_cartridge_id])


class InventoryBatch(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_batches"

    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    item_type: Mapped[str] = mapped_column(String(20), index=True)
    batch_number: Mapped[str] = mapped_column(String(40), unique=True)
    manufacture_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date] = mapped_column(Date)
    initial_quantity: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    reorder_threshold: Mapped[int] = mapped_column(Integer, default=50)
    location: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=InventoryStatus.available)
    notes: Mapped[str | None] = mapped_column(Text)

    organization: Mapped["Organization"] = relationship()  # noqa: F821


class Kit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "kits"

    kit_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inventory_batches.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=KitStatus.in_stock)
    barangay_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("barangays.id"))
    distributed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    patient_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("patient_profiles.id"), index=True)


class Cartridge(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cartridges"

    cartridge_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inventory_batches.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=CartridgeStatus.in_stock)
    lot_expiry: Mapped[date] = mapped_column(Date)
    # Prototype-only simulation hint; ignored when a physical reader is connected.
    sim_profile: Mapped[str] = mapped_column(String(32), default=SimProfile.auto)
