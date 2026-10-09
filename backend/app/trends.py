"""Stage 7: spike alerts and recurring hotspots.

Spike test: complaints in the last SPIKE_RECENT_DAYS for a (locality, category) pair are
compared with that pair's own baseline rate over the previous SPIKE_BASELINE_DAYS using a
Poisson z-score. Pairs with a spike are emerging problems worth a field visit.
"""
import math
import sqlite3
from collections import Counter
from datetime import datetime, timedelta

from . import config
from .geo import locality_by_id
from .taxonomy import CATEGORIES
from .timeutil import iso, utcnow


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
