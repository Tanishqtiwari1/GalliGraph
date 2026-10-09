from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def parse(s: str) -> datetime:
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def days_between(a: str | datetime, b: str | datetime) -> float:
    a = parse(a) if isinstance(a, str) else a
    b = parse(b) if isinstance(b, str) else b
    return abs((b - a).total_seconds()) / 86400
