"""KAIA Vision service interface.

A trained assay-interpretation model implements `VisionModel.analyze` and is registered in
`get_vision_model()`. Outputs describe assay *signals* — never disease probabilities.
"""

from dataclasses import dataclass, field
from typing import Protocol

from app.services.reader.base import AssayCapture


@dataclass
class VisionResult:
    model_version: str
    regions: list[dict]
    signal_intensity: dict[str, float]
    control_valid: bool
    hpv_signal: str
    hpv_genotype: str | None
    secondary_marker: str
    sample_quality: str
    assay_confidence: str
    confidence_score: float
    prediction: str
    pipeline: list[dict] = field(default_factory=list)


class VisionModel(Protocol):
    version: str

    def analyze(self, capture: AssayCapture) -> VisionResult: ...


def get_vision_model(version: str | None = None) -> VisionModel:
    from app.services.vision.simulated import SimulatedVisionModel

    return SimulatedVisionModel(version or SimulatedVisionModel.default_version)
