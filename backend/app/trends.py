"""Stage 7: spike alerts and recurring hotspots.

Spike test: complaints in the last SPIKE_RECENT_DAYS for a (locality, category) pair are
compared with that pair's own baseline rate over the previous SPIKE_BASELINE_DAYS using a
Poisson z-score. Pairs with a spike are emerging problems worth a field visit.
"""
import json
import math
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from statistics import median

from . import config
from .geo import haversine_m, locality_by_id, spot_relation
from .taxonomy import CATEGORIES
from .timeutil import iso, parse, utcnow


def spike_alerts(conn: sqlite3.Connection, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    recent_start = now - timedelta(days=config.SPIKE_RECENT_DAYS)
    base_start = recent_start - timedelta(days=config.SPIKE_BASELINE_DAYS)

    rows = conn.execute(
        """SELECT locality_id, category, created_at >= ? AS recent FROM complaints
           WHERE locality_id IS NOT NULL AND created_at >= ? AND created_at <= ?""",
        (iso(recent_start), iso(base_start), iso(now)),
    ).fetchall()
    recent, baseline = Counter(), Counter()
    for r in rows:
        (recent if r["recent"] else baseline)[(r["locality_id"], r["category"])] += 1

    alerts = []
    for key, observed in recent.items():
        if observed < config.SPIKE_MIN_COUNT:
            continue
        expected = baseline[key] / config.SPIKE_BASELINE_DAYS * config.SPIKE_RECENT_DAYS
        z = (observed - expected) / math.sqrt(max(expected, 0.5))
        if z < config.SPIKE_Z_THRESHOLD:
            continue
        loc_id, cat = key
        loc = locality_by_id()[loc_id]
        ratio = observed / expected if expected > 0 else None
        alerts.append({
            "locality_id": loc_id, "locality": loc["name"], "lat": loc["lat"], "lng": loc["lng"],
            "category": cat, "category_label": CATEGORIES[cat]["label"],
            "observed": observed, "expected": round(expected, 2), "z_score": round(z, 2),
            "ratio": None if ratio is None else round(ratio, 1),
            "window_days": config.SPIKE_RECENT_DAYS,
            "message": (f"{CATEGORIES[cat]['label']} complaints in {loc['name']}: {observed} in the last "
                        f"{config.SPIKE_RECENT_DAYS} days vs ~{expected:.1f} expected"
                        + (f" ({ratio:.1f}x baseline)" if ratio else " (no prior baseline)")),
            "severity": "critical" if z >= 2 * config.SPIKE_Z_THRESHOLD else "warning",
        })
    return sorted(alerts, key=lambda a: a["z_score"], reverse=True)


def daily_series(conn: sqlite3.Connection, locality_id: str, category: str, days: int = 30,
                 now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    start = (now - timedelta(days=days - 1)).date()
    rows = conn.execute(
        """SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM complaints
           WHERE locality_id = ? AND category = ? AND created_at >= ? GROUP BY day""",
        (locality_id, category, start.isoformat()),
    ).fetchall()
    counts = {r["day"]: r["n"] for r in rows}
    return [{"day": (start + timedelta(days=i)).isoformat(), "count": counts.get((start + timedelta(days=i)).isoformat(), 0)}
            for i in range(days)]


def hotspots(conn: sqlite3.Connection, limit: int = 8) -> list[dict]:
    """Locality x category pairs with the most distinct issues in the last 90 days."""
    since = iso(utcnow() - timedelta(days=90))
    rows = conn.execute(
        """SELECT locality_id, category, COUNT(*) AS issues, SUM(report_count) AS reports
           FROM issues WHERE locality_id IS NOT NULL AND first_reported >= ?
           GROUP BY locality_id, category ORDER BY issues DESC, reports DESC LIMIT ?""",
        (since, limit),
    ).fetchall()
    out = []
    for r in rows:
        loc = locality_by_id()[r["locality_id"]]
        out.append({"locality_id": r["locality_id"], "locality": loc["name"], "lat": loc["lat"], "lng": loc["lng"],
                    "category": r["category"], "category_label": CATEGORIES[r["category"]]["label"],
                    "issues": r["issues"], "reports": r["reports"]})
    return out


# Repeat failures: a problem that was closed as fixed and then came back at the same spot. Traffic and stray
# animals are left out because a new report there is a new event, not a repair that failed.
REPEAT_SKIP_CATEGORIES = {"traffic", "stray_animals"}
REPEAT_RADIUS_M = 120
REPEAT_WINDOW_DAYS = 180
_PRECISE = ("gps", "landmark")


def _same_spot(a: dict, b: dict) -> bool:
    if a["sub_type"] != b["sub_type"] and "other" not in (a["sub_type"], b["sub_type"]):
        return False
    if a["locality_id"] and b["locality_id"] and a["locality_id"] != b["locality_id"]:
        return False
    relation = spot_relation(a["keys"], b["keys"])
    if relation == "different":
        return False
    if a["geo_precision"] in _PRECISE and b["geo_precision"] in _PRECISE and a["lat"] is not None and b["lat"] is not None:
        return haversine_m(a["lat"], a["lng"], b["lat"], b["lng"]) <= REPEAT_RADIUS_M
    return relation == "same"


def repeat_failures(conn: sqlite3.Connection, department: str | None = None, days: int = 365, limit: int = 30) -> list[dict]:
    """Spots where a closed problem returned, or where citizens disputed the fix, most failures first."""
    since = iso(utcnow() - timedelta(days=days))
    disputes = Counter(r["issue_id"] for r in conn.execute("SELECT issue_id FROM issue_events WHERE kind = 'dispute' AND at >= ?", (since,)))
    rows = [{**dict(r), "keys": json.loads(r["spot_keys"] or "[]")} for r in conn.execute(
        """SELECT id, category, sub_type, summary, lat, lng, geo_precision, locality_id, location_detail, spot_keys, department,
                  status, first_reported, resolved_at, assigned_officer FROM issues
           WHERE status != 'rejected' AND first_reported >= ? ORDER BY first_reported, id""", (since,))]

    clusters: list[dict] = []
    for issue in rows:
        if issue["category"] in REPEAT_SKIP_CATEGORIES:
            continue
        start = parse(issue["first_reported"])
        home = None
        for c in clusters:
            if c["category"] != issue["category"]:
                continue
            last = c["issues"][-1]
            fixed_at = parse(last["resolved_at"]) if last["resolved_at"] and last["status"] == "resolved" else None
            if fixed_at and timedelta(0) <= start - fixed_at <= timedelta(days=REPEAT_WINDOW_DAYS) and _same_spot(last, issue):
                home = c
                c["held_days"].append((start - fixed_at).total_seconds() / 86400)
                break
        if home is None:
            home = {"category": issue["category"], "issues": [], "held_days": []}
            clusters.append(home)
        home["issues"].append(issue)

    out = []
    for c in clusters:
        issues = c["issues"]
        n_disputes = sum(disputes[i["id"]] for i in issues)
        if (not c["held_days"] and not n_disputes) or (department and all(i["department"] != department for i in issues)):
            continue
        latest = issues[-1]
        repaired = [i for i in issues if i["resolved_at"] and i["assigned_officer"]]
        loc = locality_by_id().get(latest["locality_id"] or "", {}).get("name")
        out.append({
            "category": c["category"], "category_label": CATEGORIES[c["category"]]["label"], "sub_type": latest["sub_type"],
            "locality": loc, "location_detail": latest["location_detail"], "department": latest["department"],
            "failures": len(c["held_days"]) + n_disputes, "returned": len(c["held_days"]), "disputed": n_disputes,
            "median_days_held": round(median(c["held_days"]), 1) if c["held_days"] else None,
            "last_repaired_by": repaired[-1]["assigned_officer"] if repaired else None,
            "latest_issue_id": latest["id"], "still_open": latest["status"] != "resolved",
            "history": [{"id": i["id"], "first_reported": i["first_reported"], "resolved_at": i["resolved_at"], "status": i["status"]} for i in issues],
        })
    out.sort(key=lambda s: (s["failures"], s["still_open"]), reverse=True)
    return out[:limit]
