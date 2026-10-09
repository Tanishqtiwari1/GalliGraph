"""Service-level deadlines and automatic escalation.

Each issue gets a response deadline from its priority tier, counted from when it was first reported.
If the priority rises (more reports, a safety risk), the deadline tightens. Unresolved issues past
their deadline escalate: level 1 -> ward supervisor, level 2 (past twice the allowed time) -> commissioner.
"""
import sqlite3
from datetime import datetime, timedelta

from .db import log_event
from .timeutil import iso, parse, utcnow

# (minimum score, tier, hours allowed)
TIERS = [(70, "critical", 24), (50, "high", 72), (30, "medium", 168), (0, "low", 336)]
ESCALATION_TARGET = {1: "Ward Supervisor", 2: "Municipal Commissioner"}
CLOSED = ("resolved",)


def tier_for(score: float) -> tuple[str, int]:
    for minimum, tier, hours in TIERS:
        if score >= minimum:
            return tier, hours
    return TIERS[-1][1], TIERS[-1][2]


def apply(conn: sqlite3.Connection, issue_id: int, now: datetime | None = None) -> None:
    """Set the issue's deadline from its current priority, then check escalation."""
    row = conn.execute("SELECT priority_score, first_reported, sla_tier, status FROM issues WHERE id = ?",
                       (issue_id,)).fetchone()
    tier, hours = tier_for(row["priority_score"])
    due = iso(parse(row["first_reported"]) + timedelta(hours=hours))
    conn.execute("UPDATE issues SET sla_tier = ?, sla_hours = ?, sla_due_at = ? WHERE id = ?",
                 (tier, hours, due, issue_id))
    if row["sla_tier"] and row["sla_tier"] != tier and row["status"] not in CLOSED:
        log_event(conn, issue_id, iso(now or utcnow()), "sla",
                  f"Priority tier changed {row['sla_tier']} → {tier}; deadline now {hours} h from first report")
    check(conn, issue_id, now)


def check(conn: sqlite3.Connection, issue_id: int | None = None, now: datetime | None = None) -> int:
    """Raise escalation levels for overdue issues. Returns how many issues escalated."""
    now = now or utcnow()
    sql = "SELECT id, sla_due_at, sla_hours, escalation_level FROM issues WHERE status NOT IN ('resolved') AND sla_due_at IS NOT NULL"
    args: tuple = ()
    if issue_id is not None:
        sql += " AND id = ?"
        args = (issue_id,)
    escalated = 0
    for r in conn.execute(sql, args).fetchall():
        overdue_h = (now - parse(r["sla_due_at"])).total_seconds() / 3600
        level = 0 if overdue_h <= 0 else (2 if overdue_h > r["sla_hours"] else 1)
        if level > r["escalation_level"]:
            conn.execute("UPDATE issues SET escalation_level = ? WHERE id = ?", (level, r["id"]))
            due = parse(r["sla_due_at"])
            for lvl in range(r["escalation_level"] + 1, level + 1):
                # Timestamp each escalation when it actually became due, not when we noticed it.
                at = due if lvl == 1 else due + timedelta(hours=r["sla_hours"])
                log_event(conn, r["id"], iso(at), "escalation",
                          f"Deadline missed - escalated to {ESCALATION_TARGET[lvl]}"
                          + ("" if lvl == 1 else f" (over {_fmt_hours(r['sla_hours'] * 2)} since first report)"))
            escalated += 1
    return escalated


def status_of(issue: dict, now: datetime | None = None) -> dict:
    """Deadline view for the API: due time, hours left (negative = overdue), on-time flag for closed issues."""
    now = now or utcnow()
    if not issue.get("sla_due_at"):
        return {"due_at": None, "hours_left": None, "overdue": False, "met": None}
    due = parse(issue["sla_due_at"])
    if issue["status"] in CLOSED and issue.get("resolved_at"):
        met = parse(issue["resolved_at"]) <= due
        return {"due_at": issue["sla_due_at"], "hours_left": None, "overdue": False, "met": met}
    hours_left = round((due - now).total_seconds() / 3600, 1)
    return {"due_at": issue["sla_due_at"], "hours_left": hours_left, "overdue": hours_left < 0, "met": None}


def _fmt_hours(h: float) -> str:
    return f"{h:.0f} h" if h < 48 else f"{h / 24:.1f} days"
