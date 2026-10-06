from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

LOCAL_TZ = ZoneInfo(settings.timezone)


def local_today() -> date:
    return datetime.now(LOCAL_TZ).date()


def local_day_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    day = day or local_today()
    start = datetime.combine(day, time.min, tzinfo=LOCAL_TZ).astimezone(UTC)
    return start, start + timedelta(days=1)
