"""Hardware abstraction for the KAIA Reader.

A physical reader integration implements `ReaderGateway` (e.g. over USB/BLE/MQTT) and is
selected in `get_reader_gateway()`. The rest of the platform never talks to hardware directly.
"""

from dataclasses import dataclass, field
from typing import Protocol

from app.models import Cartridge, Reader


@dataclass
class CheckResult:
    ok: bool
    message: str
    data: dict = field(default_factory=dict)


@dataclass
class AssayCapture:
    image_bytes: bytes
    content_type: str
    width: int
    height: int
    # Simulated optical readout per assay line (0..1). A real reader streams raw frames instead,
    # and KAIA Vision derives these intensities from pixels.
    sensor_readout: dict[str, float]
    sample_volume_ok: bool
    chamber_temperature_c: float


class ReaderGateway(Protocol):
    def verify_cartridge(self, reader: Reader, cartridge: Cartridge) -> CheckResult: ...

    def check_sample_quality(self, reader: Reader, cartridge: Cartridge) -> CheckResult: ...

    def process_assay(self, reader: Reader, cartridge: Cartridge) -> CheckResult: ...

    def capture(self, reader: Reader, cartridge: Cartridge) -> AssayCapture: ...


def get_reader_gateway() -> ReaderGateway:
    from app.services.reader.simulator import SimulatedReaderGateway

    return SimulatedReaderGateway()
