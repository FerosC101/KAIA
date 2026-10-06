"""Simulated KAIA Reader: produces synthetic assay captures for the prototype."""

import hashlib
import random
from datetime import date

from app.models import Cartridge, Reader
from app.models.enums import SimProfile
from app.services.reader.assay_image import render_assay_svg
from app.services.reader.base import AssayCapture, CheckResult

# Base optical intensities per synthetic profile: control, hpv (pooled high-risk),
# genotype (HPV 16/18 channel), secondary biomarker.
PROFILE_SIGNALS: dict[str, dict[str, float]] = {
    SimProfile.negative: {"control": 0.84, "hpv": 0.05, "genotype": 0.03, "secondary": 0.04},
    SimProfile.hpv_other_high_risk: {"control": 0.86, "hpv": 0.58, "genotype": 0.06, "secondary": 0.05},
    SimProfile.hpv_16_18: {"control": 0.83, "hpv": 0.72, "genotype": 0.66, "secondary": 0.07},
    SimProfile.hpv_with_marker: {"control": 0.82, "hpv": 0.69, "genotype": 0.11, "secondary": 0.55},
    SimProfile.invalid: {"control": 0.08, "hpv": 0.09, "genotype": 0.04, "secondary": 0.05},
}

AUTO_WEIGHTS = [
    (SimProfile.negative, 0.78),
    (SimProfile.hpv_other_high_risk, 0.12),
    (SimProfile.hpv_16_18, 0.04),
    (SimProfile.hpv_with_marker, 0.03),
    (SimProfile.invalid, 0.03),
]


def _rng_for(cartridge_code: str) -> random.Random:
    seed = int(hashlib.sha256(cartridge_code.encode()).hexdigest()[:12], 16)
    return random.Random(seed)


def resolve_profile(cartridge: Cartridge) -> str:
    if cartridge.sim_profile and cartridge.sim_profile != SimProfile.auto:
        return cartridge.sim_profile
    rng = _rng_for(cartridge.cartridge_code + ":profile")
    roll, acc = rng.random(), 0.0
    for profile, weight in AUTO_WEIGHTS:
        acc += weight
        if roll <= acc:
            return profile
    return SimProfile.negative


def simulated_readout(cartridge: Cartridge) -> dict[str, float]:
    profile = resolve_profile(cartridge)
    rng = _rng_for(cartridge.cartridge_code)
    base = PROFILE_SIGNALS[profile]
    return {k: round(min(1.0, max(0.0, v + rng.uniform(-0.03, 0.03))), 3) for k, v in base.items()}


class SimulatedReaderGateway:
    def verify_cartridge(self, reader: Reader, cartridge: Cartridge) -> CheckResult:
        if cartridge.lot_expiry < date.today():
            return CheckResult(False, f"Cartridge lot expired on {cartridge.lot_expiry.isoformat()}")
        return CheckResult(
            True,
            f"{cartridge.cartridge_code} authenticated · lot valid until {cartridge.lot_expiry.strftime('%b %Y')}",
        )

    def check_sample_quality(self, reader: Reader, cartridge: Cartridge) -> CheckResult:
        readout = simulated_readout(cartridge)
        adequate = readout["control"] >= 0.35
        return CheckResult(
            True,  # quality issues are surfaced by KAIA Vision QC, not a hard stop here
            "Sample volume adequate · no bubbles detected" if adequate else "Low sample migration detected",
            {"volume_ok": adequate},
        )

    def process_assay(self, reader: Reader, cartridge: Cartridge) -> CheckResult:
        return CheckResult(True, f"Incubation complete at {reader.temperature_c:.1f}°C · lateral flow stable")

    def capture(self, reader: Reader, cartridge: Cartridge) -> AssayCapture:
        readout = simulated_readout(cartridge)
        svg, width, height = render_assay_svg(cartridge.cartridge_code, readout)
        return AssayCapture(
            image_bytes=svg.encode("utf-8"),
            content_type="image/svg+xml",
            width=width,
            height=height,
            sensor_readout=readout,
            sample_volume_ok=readout["control"] >= 0.35,
            chamber_temperature_c=reader.temperature_c,
        )
