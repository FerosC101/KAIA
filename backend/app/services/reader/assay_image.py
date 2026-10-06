"""Renders a synthetic top-down image of a KAIA Cartridge assay window (SVG)."""

import hashlib
import random

WIDTH, HEIGHT = 720, 420

# Assay line layout in image coordinates (x centre of each line inside the membrane window).
LINE_LAYOUT = [
    ("control", "C", 330),
    ("hpv", "H", 395),
    ("genotype", "G", 460),
    ("secondary", "M", 525),
]
WINDOW = {"x": 290, "y": 150, "w": 280, "h": 120}
LINE_W, LINE_H = 12, 96


def region_boxes() -> list[dict]:
    """Normalised (0..1) bounding boxes of each assay region, used for overlays."""
    boxes = [
        {
            "key": "membrane_window",
            "label": "Assay window",
            "x": WINDOW["x"] / WIDTH,
            "y": WINDOW["y"] / HEIGHT,
            "w": WINDOW["w"] / WIDTH,
            "h": WINDOW["h"] / HEIGHT,
        },
        {"key": "sample_well", "label": "Sample well", "x": 152 / WIDTH, "y": 172 / HEIGHT, "w": 76 / WIDTH, "h": 76 / HEIGHT},
    ]
    for key, _, cx in LINE_LAYOUT:
        boxes.append(
            {
                "key": key,
                "label": key,
                "x": (cx - 16) / WIDTH,
                "y": (WINDOW["y"] + 6) / HEIGHT,
                "w": 32 / WIDTH,
                "h": (WINDOW["h"] - 12) / HEIGHT,
            }
        )
    return boxes


def render_assay_svg(cartridge_code: str, readout: dict[str, float]) -> tuple[str, int, int]:
    rng = random.Random(int(hashlib.sha256(cartridge_code.encode()).hexdigest()[:10], 16))
    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        "<defs>",
        '<radialGradient id="chamber" cx="50%" cy="50%" r="70%">'
        '<stop offset="0%" stop-color="#3a3d46"/><stop offset="100%" stop-color="#15161b"/></radialGradient>',
        '<linearGradient id="body" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0%" stop-color="#f1eee9"/><stop offset="100%" stop-color="#d9d4cc"/></linearGradient>',
        '<filter id="blur"><feGaussianBlur stdDeviation="1.4"/></filter>',
        "</defs>",
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="url(#chamber)"/>',
        # cartridge body
        '<rect x="110" y="80" width="500" height="260" rx="34" fill="url(#body)" stroke="#bdb6ab" stroke-width="2"/>',
        '<rect x="126" y="96" width="468" height="228" rx="26" fill="none" stroke="#ffffff" stroke-opacity="0.5"/>',
        f'<text x="140" y="126" font-family="monospace" font-size="13" fill="#6b645a">{cartridge_code}</text>',
        '<text x="540" y="126" font-family="sans-serif" font-size="13" font-weight="700" fill="#6b3a58">KAIA</text>',
        # sample well
        '<circle cx="190" cy="210" r="38" fill="#cfc6ba" stroke="#aaa196" stroke-width="2"/>',
        '<circle cx="190" cy="210" r="26" fill="#b88f8a" fill-opacity="0.55" filter="url(#blur)"/>',
        # flow channel
        '<rect x="228" y="200" width="62" height="20" fill="#e6e0d8"/>',
        # membrane window
        f'<rect x="{WINDOW["x"]}" y="{WINDOW["y"]}" width="{WINDOW["w"]}" height="{WINDOW["h"]}" rx="6" '
        'fill="#faf7f2" stroke="#b9b1a5" stroke-width="2"/>',
    ]
    # fiducial markers used by region detection
    for fx, fy in [(WINDOW["x"] - 14, WINDOW["y"] - 14), (WINDOW["x"] + WINDOW["w"] + 6, WINDOW["y"] - 14),
                   (WINDOW["x"] - 14, WINDOW["y"] + WINDOW["h"] + 6), (WINDOW["x"] + WINDOW["w"] + 6, WINDOW["y"] + WINDOW["h"] + 6)]:
        parts.append(f'<rect x="{fx}" y="{fy}" width="8" height="8" fill="#2b2b2b"/>')
    for key, letter, cx in LINE_LAYOUT:
        intensity = max(0.02, readout.get(key, 0.0))
        parts.append(
            f'<rect x="{cx - LINE_W / 2}" y="{WINDOW["y"] + 12}" width="{LINE_W}" height="{LINE_H}" rx="2" '
            f'fill="#7b2f5b" fill-opacity="{intensity:.3f}" filter="url(#blur)"/>'
        )
        parts.append(
            f'<text x="{cx}" y="{WINDOW["y"] + WINDOW["h"] + 22}" text-anchor="middle" font-family="sans-serif" '
            f'font-size="12" fill="#6b645a">{letter}</text>'
        )
    # membrane texture noise
    for _ in range(140):
        x = rng.uniform(WINDOW["x"] + 4, WINDOW["x"] + WINDOW["w"] - 4)
        y = rng.uniform(WINDOW["y"] + 4, WINDOW["y"] + WINDOW["h"] - 4)
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(0.4, 1.3):.2f}" fill="#8a7f72" fill-opacity="{rng.uniform(0.04, 0.12):.2f}"/>')
    parts.append('<text x="360" y="395" text-anchor="middle" font-family="monospace" font-size="11" fill="#8d8f98">'
                 "SYNTHETIC ASSAY IMAGE · PROTOTYPE</text>")
    parts.append("</svg>")
    return "".join(parts), WIDTH, HEIGHT
