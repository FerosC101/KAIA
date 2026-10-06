"""KAIA Population — de-identified program analytics and care-gap detection.

Combines imported historical aggregates with live platform records. Outputs contain counts
and rates only; no identifiers ever leave this module.
"""

import csv
import io
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Barangay, CarePathway, Kit, ProgramAggregate, Screening
from app.models.enums import KitStatus, PathwayStatus, ScreeningOutcome, ScreeningStatus

METRICS = (
    "kits_distributed",
    "samples_returned",
    "valid_screenings",
    "follow_up_required",
    "follow_up_completed",
    "total_days_to_follow_up",
)
SMALL_CELL = 5


def _month(d: date) -> date:
    return date(d.year, d.month, 1)


def _rate(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


@dataclass
class ProgramData:
    barangays: list[Barangay]
    by_barangay: dict[uuid.UUID | None, Counter]
    by_month: dict[date, Counter]
    totals: Counter


def collect(db: Session, organization_id: uuid.UUID) -> ProgramData:
    barangays = list(db.scalars(select(Barangay).where(Barangay.organization_id == organization_id).order_by(Barangay.name)))
    by_barangay: dict[uuid.UUID | None, Counter] = defaultdict(Counter)
    by_month: dict[date, Counter] = defaultdict(Counter)

    def add(barangay_id, month: date, metric: str, value: int = 1) -> None:
        by_barangay[barangay_id][metric] += value
        by_month[month][metric] += value

    for agg in db.scalars(select(ProgramAggregate).where(ProgramAggregate.organization_id == organization_id)):
        for metric in METRICS:
            add(agg.barangay_id, agg.month, metric, getattr(agg, metric))

    kits = db.execute(
        select(Kit.barangay_id, Kit.distributed_at).where(
            Kit.organization_id == organization_id,
            Kit.status.in_([KitStatus.distributed, KitStatus.registered, KitStatus.used]),
            Kit.distributed_at.is_not(None),
        )
    )
    for barangay_id, distributed_at in kits:
        add(barangay_id, _month(distributed_at.date()), "kits_distributed")

    rows = db.execute(
        select(Screening, CarePathway)
        .outerjoin(CarePathway, CarePathway.screening_id == Screening.id)
        .where(Screening.organization_id == organization_id, Screening.sample_collected_at.is_not(None))
    )
    for screening, pathway in rows:
        add(screening.barangay_id, _month(screening.sample_collected_at.date()), "samples_returned")
        if screening.status != ScreeningStatus.result_ready or screening.released_at is None:
            continue
        month = _month(screening.released_at.date())
        add(screening.barangay_id, month, "valid_screenings")
        if screening.outcome in (ScreeningOutcome.follow_up_recommended, ScreeningOutcome.priority_follow_up):
            add(screening.barangay_id, month, "follow_up_required")
            if pathway is not None and pathway.status == PathwayStatus.completed and pathway.completed_at:
                add(screening.barangay_id, month, "follow_up_completed")
                days = max(0, (pathway.completed_at.date() - screening.released_at.date()).days)
                add(screening.barangay_id, month, "total_days_to_follow_up", days)

    totals: Counter = Counter()
    for counter in by_month.values():
        totals.update(counter)
    return ProgramData(barangays=barangays, by_barangay=by_barangay, by_month=by_month, totals=totals)


def summary(data: ProgramData) -> dict:
    t = data.totals
    eligible = sum(b.eligible_population for b in data.barangays)
    required, completed = t["follow_up_required"], t["follow_up_completed"]
    return {
        "eligible_population": eligible,
        "kits_distributed": t["kits_distributed"],
        "samples_returned": t["samples_returned"],
        "valid_screenings": t["valid_screenings"],
        "follow_up_required": required,
        "follow_up_completed": completed,
        "unresolved": required - completed,
        "participation_rate": _rate(t["valid_screenings"], eligible),
        "sample_return_rate": _rate(t["samples_returned"], t["kits_distributed"]),
        "follow_up_completion_rate": _rate(completed, required),
        "avg_days_to_follow_up": round(t["total_days_to_follow_up"] / completed, 1) if completed else None,
    }


def funnel(data: ProgramData) -> list[dict]:
    s = summary(data)
    stages = [
        ("eligible", "Eligible", s["eligible_population"]),
        ("kits_distributed", "Kit Distributed", s["kits_distributed"]),
        ("screened", "Screened", s["valid_screenings"]),
        ("follow_up_required", "Follow-Up Required", s["follow_up_required"]),
        ("follow_up_completed", "Follow-Up Completed", s["follow_up_completed"]),
    ]
    out, previous = [], None
    for key, label, value in stages:
        out.append({
            "key": key,
            "label": label,
            "value": value,
            "pct_of_eligible": _rate(value, s["eligible_population"]),
            "conversion_from_previous": _rate(value, previous) if previous is not None else None,
        })
        previous = value
    return out


def barangay_breakdown(data: ProgramData) -> list[dict]:
    out = []
    for b in data.barangays:
        c = data.by_barangay.get(b.id, Counter())
        out.append({
            "barangay_id": str(b.id),
            "barangay": b.name,
            "eligible_population": b.eligible_population,
            "kits_distributed": c["kits_distributed"],
            "samples_returned": c["samples_returned"],
            "valid_screenings": c["valid_screenings"],
            "follow_up_required": c["follow_up_required"],
            "follow_up_completed": c["follow_up_completed"],
            "coverage_rate": _rate(c["valid_screenings"], b.eligible_population),
            "sample_return_rate": _rate(c["samples_returned"], c["kits_distributed"]),
            "follow_up_completion_rate": _rate(c["follow_up_completed"], c["follow_up_required"]),
            "avg_days_to_follow_up": round(c["total_days_to_follow_up"] / c["follow_up_completed"], 1)
            if c["follow_up_completed"] else None,
        })
    return out


def monthly(data: ProgramData, months: int = 18) -> list[dict]:
    keys = sorted(data.by_month)[-months:]
    out = []
    for m in keys:
        c = data.by_month[m]
        out.append({
            "month": m.isoformat(),
            "kits_distributed": c["kits_distributed"],
            "valid_screenings": c["valid_screenings"],
            "follow_up_required": c["follow_up_required"],
            "follow_up_completed": c["follow_up_completed"],
            "referral_completion_rate": _rate(c["follow_up_completed"], c["follow_up_required"]),
            "avg_days_to_follow_up": round(c["total_days_to_follow_up"] / c["follow_up_completed"], 1)
            if c["follow_up_completed"] else None,
        })
    return out


def care_gaps(data: ProgramData) -> dict:
    s = summary(data)
    city_participation = s["participation_rate"] or 0
    city_completion = s["follow_up_completion_rate"] or 0
    alerts = []
    for row in barangay_breakdown(data):
        name = row["barangay"]
        coverage = row["coverage_rate"] or 0
        completion = row["follow_up_completion_rate"]
        return_rate = row["sample_return_rate"]
        if coverage < city_participation - 0.15:
            alerts.append({
                "id": f"{row['barangay_id']}-participation",
                "barangay": name,
                "gap_type": "low_participation",
                "stage": "Screening participation",
                "severity": "high" if coverage < city_participation - 0.22 else "medium",
                "headline": "Women are not entering the screening pathway",
                "metrics": [
                    {"label": "Screening participation", "value": coverage, "format": "percent"},
                    {"label": "City average", "value": city_participation, "format": "percent"},
                ],
                "recommendation": "Increase kit distribution and community outreach.",
            })
        if completion is not None and row["follow_up_required"] >= SMALL_CELL and completion < min(0.6, city_completion - 0.15):
            alerts.append({
                "id": f"{row['barangay_id']}-follow-up",
                "barangay": name,
                "gap_type": "follow_up_loss",
                "stage": "Follow-up completion",
                "severity": "high" if completion < 0.5 else "medium",
                "headline": "Women are screened but not completing follow-up",
                "metrics": [
                    {"label": "Screening participation", "value": coverage, "format": "percent"},
                    {"label": "Follow-up completion", "value": completion, "format": "percent"},
                ],
                "recommendation": "Investigate referral accessibility.",
            })
        if return_rate is not None and row["kits_distributed"] >= 20 and return_rate < 0.7:
            alerts.append({
                "id": f"{row['barangay_id']}-return",
                "barangay": name,
                "gap_type": "sample_return",
                "stage": "Sample return",
                "severity": "medium",
                "headline": "Kits distributed but samples not returned",
                "metrics": [
                    {"label": "Sample return rate", "value": return_rate, "format": "percent"},
                    {"label": "Kits distributed", "value": row["kits_distributed"], "format": "number"},
                ],
                "recommendation": "Add sample drop-off points and send return reminders.",
            })
        if row["avg_days_to_follow_up"] and row["avg_days_to_follow_up"] > 45:
            alerts.append({
                "id": f"{row['barangay_id']}-delay",
                "barangay": name,
                "gap_type": "slow_follow_up",
                "stage": "Time to follow-up",
                "severity": "medium",
                "headline": "Follow-up is taking too long",
                "metrics": [
                    {"label": "Average days to follow-up", "value": row["avg_days_to_follow_up"], "format": "days"},
                    {"label": "Program average", "value": s["avg_days_to_follow_up"], "format": "days"},
                ],
                "recommendation": "Review appointment capacity at partner facilities.",
            })
    severity_rank = {"high": 0, "medium": 1}
    alerts.sort(key=lambda a: (severity_rank[a["severity"]], a["barangay"]))
    return {"city_participation_rate": city_participation, "city_follow_up_completion_rate": city_completion, "alerts": alerts}


def export_csv(data: ProgramData) -> str:
    """Aggregate export with small-cell suppression (counts 1–4 shown as '<5')."""

    def cell(value: int) -> str:
        return "<5" if 0 < value < SMALL_CELL else str(value)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["barangay", "eligible_population", "kits_distributed", "samples_returned", "valid_screenings",
                     "follow_up_required", "follow_up_completed", "coverage_rate", "follow_up_completion_rate"])
    for row in barangay_breakdown(data):
        writer.writerow([
            row["barangay"], row["eligible_population"], cell(row["kits_distributed"]), cell(row["samples_returned"]),
            cell(row["valid_screenings"]), cell(row["follow_up_required"]), cell(row["follow_up_completed"]),
            f"{row['coverage_rate']:.3f}" if row["coverage_rate"] is not None else "",
            f"{row['follow_up_completion_rate']:.3f}" if row["follow_up_completion_rate"] is not None else "",
        ])
    return buffer.getvalue()
