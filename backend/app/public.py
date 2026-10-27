"""What citizens can see. Deliberately aggregated: categories, areas, status and timings only.
Never complaint text, photos, contacts or officer names."""
import sqlite3
from datetime import timedelta
from statistics import median

from . import analytics, sla, trends
from .geo import locality_by_id
from .taxonomy import CATEGORIES
from .timeutil import iso, parse, utcnow


def _label(category: str, sub_type: str, locality: str | None) -> str:
    what = sub_type.replace("_", " ") if sub_type != "other" else CATEGORIES[category]["label"].lower()
    return f"{what.capitalize()}" + (f" in {locality}" if locality else "")


def map_points(conn: sqlite3.Connection, include_resolved_days: int = 30, category: str | None = None) -> list[dict]:
    since = iso(utcnow() - timedelta(days=include_resolved_days))
    sql = ("SELECT id, category, sub_type, lat, lng, locality_id, status, report_count, priority_score, "
           "first_reported, resolved_at, sla_due_at, sla_hours, department, confirmations FROM issues "
           "WHERE lat IS NOT NULL AND (status NOT IN ('resolved', 'rejected') OR resolved_at >= ?)")
    args: list = [since]
    if category:
        sql += " AND category = ?"
        args.append(category)
    now = utcnow()
    out = []
    for r in conn.execute(sql, args):
        loc = locality_by_id().get(r["locality_id"] or "", {}).get("name")
        resolved = r["status"] == "resolved"
        out.append({
            "id": r["id"],
            # ~100 m precision: enough for a heat map, not enough to point at someone's house
            "lat": round(r["lat"], 3), "lng": round(r["lng"], 3),
            "category": r["category"], "label": _label(r["category"], r["sub_type"], loc),
            "locality": loc, "status": "resolved" if resolved else ("in_progress" if r["status"] != "open" else "open"),
            "reports": r["report_count"], "confirmations": r["confirmations"],
            "tier": sla.tier_for(r["priority_score"])[0], "score": round(r["priority_score"]),
            "first_reported": r["first_reported"],
            "department": r["department"],
            "days_open": round(((parse(r["resolved_at"]) if resolved else now) - parse(r["first_reported"])).total_seconds() / 86400, 1),
            "overdue": (not resolved) and r["sla_due_at"] is not None and parse(r["sla_due_at"]) < now,
        })
    return out


def summary(conn: sqlite3.Connection, days: int = 30) -> dict:
    perf = analytics.performance(conn, days)
    q = lambda sql, *a: conn.execute(sql, a).fetchone()[0]
    since = iso(utcnow() - timedelta(days=days))
    resolved_rows = conn.execute("SELECT first_reported, resolved_at FROM issues WHERE status = 'resolved' AND resolved_at >= ?",
                                 (since,)).fetchall()
    fix_days = [(parse(r["resolved_at"]) - parse(r["first_reported"])).total_seconds() / 86400 for r in resolved_rows]
    keep = ("open", "overdue", "resolved", "median_resolution_hours", "sla_compliance_pct")
    return {
        "window_days": days,
        "complaints_received": q("SELECT COUNT(*) FROM complaints WHERE created_at >= ?", since),
        "issues_resolved": len(resolved_rows),
        "active_issues": q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected')"),
        "duplicates_merged": q("SELECT COUNT(*) FROM complaints WHERE created_at >= ?", since)
                             - q("SELECT COUNT(*) FROM issues WHERE first_reported >= ?", since),
        "median_fix_days": round(median(fix_days), 1) if fix_days else None,
        "avg_triage_ms": round(q("SELECT COALESCE(AVG(processing_ms), 0) FROM complaints WHERE created_at >= ?", since)),
        "hotspots": trends.hotspots(conn, 6),
        "on_time_pct": perf["overall"]["sla_compliance_pct"],
        "departments": [{"department": d["department"], **{k: d[k] for k in keep}} for d in perf["departments"]],
        "areas": [{"locality_id": w["locality_id"], "locality": w["locality"], **{k: w[k] for k in keep}}
                  for w in perf["wards"]],
        "weekly": perf["weekly"],
        "by_category": {k: q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected') AND category = ?", k)
                        for k in CATEGORIES},
        # Spikes tell residents "this is already known and being looked at" - no need to re-report.
        "notices": [{"locality": a["locality"], "category": a["category"], "category_label": a["category_label"],
                     "message": f"Many {a['category_label'].lower()} complaints in {a['locality']} in the last "
                                f"{a['window_days']} days. The department has been alerted."}
                    for a in trends.spike_alerts(conn)],
    }


def complaint_receipt(result: dict) -> dict:
    """What a citizen gets back after reporting: their own extraction + where it went. No other people's data."""
    c, i = result["complaint"], result["issue"]
    ex = c["extracted"]
    return {
        "tracking_code": c["tracking_code"],
        "merged": result["merged"],
        "report_count": i["report_count"],
        "extractor": c["extractor"],
        "processing_ms": c["processing_ms"],
        "geo_precision": c["geo_precision"],
        "understood": {k: ex.get(k) for k in ("category", "sub_type", "location_text", "location_detail",
                                              "duration_days", "severity", "safety_risk", "language", "summary_en")},
        "department": i["department"],
        "secondary_department": i.get("secondary_department"),
        "priority_score": i["priority_score"],
        "priority_breakdown": i["priority_breakdown"],
        "tier": i["sla_tier"],
        "deadline": sla.status_of(i),
        "status": i["status"],
    }


PUBLIC_KINDS = ("created", "sms", "triage", "assignment", "status", "update", "verification", "escalation", "routing",
                "info_request", "info_reply", "citizen_feedback", "dispute", "confirmation")


def track(conn: sqlite3.Connection, code: str) -> dict | None:
    c = conn.execute("SELECT issue_id, created_at FROM complaints WHERE tracking_code = ?", (code.strip().upper(),)).fetchone()
    if not c:
        return None
    i = dict(conn.execute("SELECT * FROM issues WHERE id = ?", (c["issue_id"],)).fetchone())
    loc = locality_by_id().get(i["locality_id"] or "", {}).get("name")
    events = [dict(e) for e in conn.execute(
        "SELECT at, kind, message FROM issue_events WHERE issue_id = ? AND kind IN (%s) ORDER BY at, id"
        % ",".join("?" * len(PUBLIC_KINDS)), (i["id"], *PUBLIC_KINDS))]
    others = i["report_count"] - 1
    status = i["status"]

    # Stages that have actually happened (Submitted -> Reviewed -> Assigned -> In progress -> Resolution review -> Resolved)
    def first_at(pred):
        return next((e["at"] for e in events if pred(e)), None)
    stages = [{"key": "submitted", "label": "Submitted", "at": c["created_at"]}]
    reviewed = i["reviewed_at"] or first_at(lambda e: e["kind"] in ("triage", "assignment"))
    if reviewed:
        stages.append({"key": "reviewed", "label": "Reviewed", "at": reviewed})
    assigned = first_at(lambda e: e["kind"] == "assignment")
    if assigned or status in ("assigned", "in_progress", "needs_verification", "resolved"):
        stages.append({"key": "assigned", "label": "Assigned", "at": assigned})
    started = first_at(lambda e: e["kind"] == "status" and "in progress" in e["message"])
    if started or status in ("in_progress",):
        stages.append({"key": "in_progress", "label": "In progress", "at": started})
    review = first_at(lambda e: e["kind"] == "verification")
    if review or status == "needs_verification":
        stages.append({"key": "resolution_review", "label": "Resolution review", "at": review})
    if status == "resolved":
        stages.append({"key": "resolved", "label": "Resolved", "at": i["resolved_at"]})
    if status == "rejected":
        stages.append({"key": "rejected", "label": "Closed - not actionable", "at": i["resolved_at"]})

    return {
        "tracking_code": code.strip().upper(),
        "reported_at": c["created_at"],
        "label": _label(i["category"], i["sub_type"], loc),
        "category": i["category"],
        "status": status,
        "stages": stages,
        "department": i["department"],
        "secondary_department": i["secondary_department"],
        "report_count": i["report_count"],
        "tier": i["sla_tier"],
        "deadline": sla.status_of(i),
        "escalated": i["escalation_level"] > 0 and status not in ("resolved", "rejected"),
        "info_request": i["info_request"] if status == "info_requested" else None,
        "has_evidence": bool(i["after_image"]),
        "resolution_note": i["resolution_note"] if status in ("needs_verification", "resolved") else None,
        "can_give_feedback": status in ("resolved", "needs_verification"),
        "disputed": bool(i["disputed"]),
        "sms_opt_in": bool(conn.execute("SELECT sms_opt_in FROM complaints WHERE tracking_code = ?", (code.strip().upper(),)).fetchone()[0]),
        "message": (f"{others} other citizen{'s' if others != 1 else ''} reported the same problem, so it is being handled as "
                    "one issue. " if others else "")
                   + (f"It is with {i['department']}." if status != "rejected" else ""),
        # Timeline without officer names or internal notes
        "timeline": [{"at": e["at"], "kind": e["kind"], "message": _public_event(e["message"], e["kind"])} for e in events],
    }


def _public_event(msg: str, kind: str = "") -> str:
    if kind == "sms":
        return "SMS update sent"
    if kind == "update":
        return f"Update from the department: {msg}"
    if kind == "triage":
        return "Reviewed by a municipal officer"
    if kind == "info_request":
        return "The officer needs more information from you"
    if kind == "info_reply":
        return "You added more information"
    # Several citizens can share one issue: never show one reporter's own words to the others
    if kind == "dispute":
        return "A resident says the problem persists - sent for review"
    if kind == "citizen_feedback":
        return "A resident confirmed the fix"
    if msg.startswith("Rejected as not actionable"):
        return msg.replace("Rejected as not actionable", "Closed as not actionable")
    if msg.startswith("Fix reported"):
        return "The department reported the problem fixed - under review"
    if msg.startswith("Supervisor approved the closure"):
        return "Fix verified and complaint resolved"
    if msg.startswith("Supervisor rejected the closure"):
        return "Fix not accepted - sent back for repair"
    if msg.startswith("Assigned to"):
        return "Assigned to a field officer"
    if msg.startswith("Escalated to"):
        return "Escalated to a senior officer"
    if msg.startswith("Issue opened"):
        return "Complaint received and routed"
    if msg.startswith("Closure accepted"):
        return "Repair verified and issue closed"
    if msg.startswith("Closure flagged"):
        return "Department reported a fix; awaiting verification"
    if msg.startswith("Deadline missed"):
        return "Deadline missed - escalated to a senior officer"
    if msg.startswith("A resident confirmed"):
        return msg
    if msg.startswith("Re-routed"):
        return "Transferred to the right department"
    return msg.split(" by ")[0]
