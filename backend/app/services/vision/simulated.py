"""Simulated KAIA Vision model.

Mirrors the real pipeline stages (region detection → signal quantification → quality control →
screening classification) but reads the simulated reader's optical readout instead of running
a CNN over pixels.
"""

import hashlib
import random

from app.services.reader.assay_image import region_boxes
from app.services.reader.base import AssayCapture
from app.services.vision.base import VisionResult

DETECTION_THRESHOLD = 0.25
INDETERMINATE_FLOOR = 0.18
CONTROL_THRESHOLD = 0.35

REGION_LABELS = {
    "control": "Control line",
    "hpv": "High-risk HPV signal",
    "genotype": "HPV 16/18 genotype channel",
    "secondary": "Secondary biomarker",
}


def _state(value: float) -> str:
    if value >= DETECTION_THRESHOLD:
        return "detected"
    if value >= INDETERMINATE_FLOOR:
        return "indeterminate"
    return "not_detected"


class SimulatedVisionModel:
    default_version = "kaia-vision-sim-1.3.0"

    def __init__(self, version: str) -> None:
        self.version = version

    def analyze(self, capture: AssayCapture) -> VisionResult:
        seed = int(hashlib.sha256(capture.image_bytes[:512]).hexdigest()[:8], 16)
        rng = random.Random(seed)

        # 1. Region detection (fiducial-anchored layout)
        regions = []
        for box in region_boxes():
            label = REGION_LABELS.get(box["key"], box["label"])
            regions.append({**box, "label": label, "detection_score": round(rng.uniform(0.96, 0.995), 3)})

        # 2. Signal quantification (background-subtracted intensity)
        background = round(rng.uniform(0.01, 0.025), 3)
        intensity = {k: round(max(0.0, v + rng.uniform(-0.01, 0.01)), 3) for k, v in capture.sensor_readout.items()}
        for region in regions:
            if region["key"] in intensity:
                region["intensity"] = intensity[region["key"]]
                region["state"] = _state(intensity[region["key"]]) if region["key"] != "control" else (
                    "valid" if intensity["control"] >= CONTROL_THRESHOLD else "invalid"
                )

        # 3. Quality control
        control_valid = intensity["control"] >= CONTROL_THRESHOLD
        if control_valid and capture.sample_volume_ok and intensity["control"] >= 0.6:
            sample_quality = "good"
        elif control_valid:
            sample_quality = "acceptable"
        else:
            sample_quality = "poor"

        # 4. Screening classification (signals only — no disease inference)
        hpv_signal = _state(intensity["hpv"])
        secondary = _state(intensity["secondary"])
        genotype = None
        if hpv_signal == "detected":
            genotype = "hpv_16_18" if intensity["genotype"] >= DETECTION_THRESHOLD else "other_high_risk"

        margins = [abs(intensity[k] - DETECTION_THRESHOLD) for k in ("hpv", "genotype", "secondary")]
        margins.append(abs(intensity["control"] - CONTROL_THRESHOLD))
        min_margin = min(margins)
        confidence_score = round(min(0.99, 0.55 + min_margin * 1.6), 3)
        confidence = "high" if min_margin >= 0.15 else "moderate" if min_margin >= 0.07 else "low"

        if not control_valid:
            prediction, confidence = "invalid_assay", "high" if intensity["control"] < 0.2 else confidence
        elif hpv_signal == "detected" and secondary == "detected":
            prediction = "hpv_and_secondary_signal_detected"
        elif hpv_signal == "detected":
            prediction = "hpv_high_risk_signal_detected"
        elif hpv_signal == "indeterminate":
            prediction = "indeterminate_signal"
        else:
            prediction = "no_high_risk_signal"

        pipeline = [
            {"key": "image", "label": "Image", "duration_ms": 42,
             "summary": f"{capture.width}×{capture.height} capture at {capture.chamber_temperature_c:.1f}°C"},
            {"key": "region_detection", "label": "Region Detection", "duration_ms": rng.randint(110, 160),
             "summary": f"{len(regions)} regions located via 4 fiducial markers"},
            {"key": "signal_quantification", "label": "Signal Quantification", "duration_ms": rng.randint(70, 110),
             "summary": f"Background-subtracted (bg={background})"},
            {"key": "quality_control", "label": "Quality Control", "duration_ms": rng.randint(20, 40),
             "summary": f"Control {'valid' if control_valid else 'invalid'} · sample quality {sample_quality}"},
            {"key": "screening_classification", "label": "Screening Classification", "duration_ms": rng.randint(30, 60),
             "summary": prediction.replace("_", " ")},
        ]

        return VisionResult(
            model_version=self.version,
            regions=regions,
            signal_intensity={**intensity, "background": background},
            control_valid=control_valid,
            hpv_signal=hpv_signal if control_valid else "indeterminate",
            hpv_genotype=genotype if control_valid else None,
            secondary_marker=secondary if control_valid else "indeterminate",
            sample_quality=sample_quality,
            assay_confidence=confidence,
            confidence_score=confidence_score,
            prediction=prediction,
            pipeline=pipeline,
        )
