"""Stage 5: explainable priority score (0-100).

Every point is attributable to a named factor, so officials can defend the ranking.
"""
import math
import sqlite3
from datetime import datetime, timedelta

import json

from .geo import haversine_m, locality_by_id, localities, pois_near, spot_relation
from .timeutil import iso, parse, utcnow

WEIGHTS = {
    "severity": 30,
    "population": 20,
    "reports": 15,
    "duration": 15,
    "recurrence": 10,
    "safety": 10,
}
SENSITIVE_POI = {"school", "hospital", "clinic", "college", "kindergarten"}
RECURRENCE_LOOKBACK_DAYS = 90
RECURRENCE_RADIUS_M = 300


def _max_population() -> int:
    return max(loc["population"] for loc in localities())


def _recurrence_count(conn: sqlite3.Connection, issue: dict) -> int:
    """Earlier issues of the same category at (roughly) the same place."""
    since = iso(parse(issue["first_reported"]) - timedelta(days=RECURRENCE_LOOKBACK_DAYS))
    rows = conn.execute(
        """SELECT lat, lng, locality_id, geo_precision, spot_keys FROM issues
           WHERE category = ? AND id != ? AND first_reported >= ? AND first_reported < ?""",
        (issue["category"], issue["id"], since, issue["first_reported"]),
    ).fetchall()
    n = 0
    for r in rows:
        if issue["lat"] is None or r["lat"] is None:
            continue
        precise = issue["geo_precision"] in ("gps", "landmark") and r["geo_precision"] in ("gps", "landmark")
        if precise:
            n += haversine_m(issue["lat"], issue["lng"], r["lat"], r["lng"]) <= RECURRENCE_RADIUS_M
        else:
            same_spot = spot_relation(json.loads(issue.get("spot_keys") or "[]"), json.loads(r["spot_keys"] or "[]")) == "same"
            n += issue["locality_id"] is not None and issue["locality_id"] == r["locality_id"] and same_spot
    return n


def score(conn: sqlite3.Connection, issue: dict, now: datetime | None = None) -> tuple[float, list[dict]]:
    now = now or utcnow()
    factors: list[dict] = []

    def add(key: str, value: float, reason: str) -> None:
        value = max(0.0, min(1.0, value))
        factors.append({"factor": key, "weight": WEIGHTS[key], "value": round(value, 3),
                        "points": round(WEIGHTS[key] * value, 1), "reason": reason})

    sev = issue["severity"]
    add("severity", (sev - 1) / 4, f"Severity {sev}/5")

    # Population impact: locality density + sensitive places nearby (schools, hospitals).
    loc = locality_by_id().get(issue["locality_id"] or "")
    density = loc["population"] / _max_population() if loc else 0.3
    precise = issue["geo_precision"] in ("gps", "landmark")  # a locality centroid says nothing about what is nearby
    nearby = [p for p in pois_near(issue["lat"], issue["lng"], 300) if p.get("type") in SENSITIVE_POI] if precise else []
    if nearby:
        impact = 0.5 * density + 0.5 * min(1.0, len(nearby) / 2)
        reason = f"~{loc['population']:,} residents in {loc['name']}; near {nearby[0]['name']} ({nearby[0]['distance_m']} m)" \
            if loc else f"Near {nearby[0]['name']}"
    else:
        impact = density
        reason = f"~{loc['population']:,} residents in {loc['name']}" if loc else "Location unknown (default impact)"
    add("population", impact, reason)

    n = issue["report_count"]
    confirmed = issue.get("confirmations") or 0
    reason = f"{n} citizen report{'s' if n != 1 else ''}" + (f" + {confirmed} neighbour{'s' if confirmed != 1 else ''} confirmed"
                                                            if confirmed else "")
    add("reports", math.log1p(n + 0.5 * confirmed) / math.log1p(15), reason)

    age = (now - parse(issue["first_reported"])).total_seconds() / 86400 + (issue["reported_duration_days"] or 0)
    add("duration", age / 30, f"Problem open ~{age:.0f} day{'s' if round(age) != 1 else ''}")

    rec = _recurrence_count(conn, issue)
    add("recurrence", rec / 3, f"{rec} earlier issue{'s' if rec != 1 else ''} of this type here in 90 days" if rec
        else "No recent recurrence here")

    add("safety", 1.0 if issue["safety_risk"] else 0.0,
        "Safety risk (injury / disease / electrocution)" if issue["safety_risk"] else "No direct safety risk reported")

    total = round(sum(f["points"] for f in factors), 1)
    factors.sort(key=lambda f: f["points"], reverse=True)
    return total, factors
