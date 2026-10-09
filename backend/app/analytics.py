"""Accountability metrics: who is resolving what, how fast, and within deadline."""
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median

from .geo import locality_by_id
from .timeutil import parse, utcnow


def _summarise(rows: list[sqlite3.Row], now: datetime, window_start: datetime) -> dict:
    open_rows = [r for r in rows if r["status"] not in ("resolved", "rejected")]
    overdue = [r for r in open_rows if r["sla_due_at"] and parse(r["sla_due_at"]) < now]
    resolved = [r for r in rows if r["status"] == "resolved" and r["resolved_at"]
                and parse(r["resolved_at"]) >= window_start]
    hours = [(parse(r["resolved_at"]) - parse(r["first_reported"])).total_seconds() / 3600 for r in resolved]
    with_deadline = [r for r in resolved if r["sla_due_at"]]
    met = sum(parse(r["resolved_at"]) <= parse(r["sla_due_at"]) for r in with_deadline)
    in_window = [r for r in rows if parse(r["first_reported"]) >= window_start]
    resolved_in_window = sum(r["status"] == "resolved" for r in in_window)
    return {
        "open": len(open_rows),
        "overdue": len(overdue),
        "overdue_critical": sum(r["sla_tier"] == "critical" for r in overdue),
        "overdue_rate_pct": round(100 * len(overdue) / len(open_rows), 1) if open_rows else 0.0,
        "escalated": sum(r["escalation_level"] > 0 for r in open_rows),
        "awaiting_verification": sum(r["status"] == "needs_verification" for r in rows),
        "resolved": len(resolved),
        "median_resolution_hours": round(median(hours), 1) if hours else None,
        "sla_compliance_pct": round(100 * met / len(with_deadline), 1) if with_deadline else None,
        "resolution_rate_pct": round(100 * resolved_in_window / len(in_window), 1) if in_window else None,
        "avg_open_priority": round(sum(r["priority_score"] for r in open_rows) / len(open_rows), 1) if open_rows else 0.0,
    }


def performance(conn: sqlite3.Connection, days: int = 30, now: datetime | None = None) -> dict:
    now = now or utcnow()
    window_start = now - timedelta(days=days)
    rows = conn.execute(
        "SELECT id, department, locality_id, status, priority_score, sla_tier, sla_due_at, escalation_level, "
        "first_reported, resolved_at FROM issues").fetchall()

    by_dept, by_ward = defaultdict(list), defaultdict(list)
    for r in rows:
        by_dept[r["department"]].append(r)
        if r["locality_id"]:
            by_ward[r["locality_id"]].append(r)

    departments = sorted(({"department": d, **_summarise(rs, now, window_start)} for d, rs in by_dept.items()),
                         key=lambda d: (-d["overdue"], -d["open"]))
    wards = sorted(({"locality_id": w, "locality": locality_by_id()[w]["name"], **_summarise(rs, now, window_start)}
                    for w, rs in by_ward.items()), key=lambda d: (-d["overdue"], -d["overdue_rate_pct"]))

    # Weekly resolution trend for the window
    weeks = []
    for i in range(max(1, days // 7), 0, -1):
        start, end = now - timedelta(days=7 * i), now - timedelta(days=7 * (i - 1))
        opened = sum(start <= parse(r["first_reported"]) < end for r in rows)
        closed = sum(r["resolved_at"] is not None and start <= parse(r["resolved_at"]) < end for r in rows)
        weeks.append({"week_start": start.date().isoformat(), "opened": opened, "resolved": closed})

    return {"window_days": days, "overall": _summarise(rows, now, window_start),
            "departments": departments, "wards": wards, "weekly": weeks}
