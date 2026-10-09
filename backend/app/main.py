"""CivicPulse API. Run: uvicorn app.main:app --reload (from backend/)."""
import json
import threading
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import analytics, db, embed, extract, sla, trends
from .geo import localities, locality_by_id
from .media import UPLOAD_DIR, MediaError, save_image
from .pipeline import ingest, rescore_all, rescore_issue
from .taxonomy import CATEGORIES, department_for
from .timeutil import iso, utcnow
from .verify import verify_resolution

STATUSES = ["open", "assigned", "in_progress", "needs_verification", "resolved"]
TIER_RANGES = {"critical": (70, 101), "high": (50, 70), "medium": (30, 50), "low": (0, 30)}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    with db.session() as conn:
        rescore_all(conn)  # durations age, so refresh scores (and deadlines) on boot
    yield


app = FastAPI(title="CivicPulse API", version="0.2.0", lifespan=lifespan,
              description="AI triage for civic complaints: extract, deduplicate, prioritise, route, track, verify.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/api/media", StaticFiles(directory=UPLOAD_DIR), name="media")

# SQLite has a single writer; serialising ingestion also keeps dedup decisions race-free.
_ingest_lock = threading.Lock()


# ----------------------------------------------------------------------------- models

ImageType = Literal["image/jpeg", "image/png", "image/webp", "image/gif"]


class ComplaintIn(BaseModel):
    text: str = Field(min_length=3, max_length=5000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    channel: Literal["web", "whatsapp", "email", "app", "voice", "import"] = "web"
    image_base64: str | None = Field(default=None, description="Optional photo, base64 without data: prefix")
    image_media_type: ImageType | None = None
    created_at: str | None = Field(default=None, description="ISO timestamp; defaults to now (used for imports)")
    reporter_contact: str | None = None


class IssuePatch(BaseModel):
    status: Literal["open", "assigned", "in_progress", "needs_verification", "resolved"] | None = None
    department: str | None = None
    assigned_officer: str | None = Field(default=None, max_length=100)
    actor: str = Field(default="Ward official", max_length=100)


class ResolveIn(BaseModel):
    officer: str = Field(default="Field officer", max_length=100)
    note: str | None = Field(default=None, max_length=2000)
    after_image_base64: str | None = None
    after_image_media_type: ImageType | None = None


# ----------------------------------------------------------------------------- helpers

def _decorate(conn, issue: dict) -> dict:
    issue["locality"] = locality_by_id().get(issue["locality_id"] or "", {}).get("name")
    issue["sla"] = sla.status_of(issue)
    return issue


def _issue_detail(conn, issue_id: int) -> dict:
    row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    if not row:
        raise HTTPException(404, "issue not found")
    issue = _decorate(conn, db.issue_row_to_dict(row))
    issue["complaints"] = [db.complaint_row_to_dict(r) for r in conn.execute(
        "SELECT * FROM complaints WHERE issue_id = ? ORDER BY created_at", (issue_id,))]
    issue["tasks"] = [dict(r) for r in conn.execute(
        "SELECT * FROM issue_tasks WHERE issue_id = ? ORDER BY role DESC, id", (issue_id,))]
    issue["events"] = [dict(r) for r in conn.execute(
        "SELECT at, kind, message, actor FROM issue_events WHERE issue_id = ? ORDER BY at, id", (issue_id,))]
    issue["rank"] = conn.execute(
        "SELECT COUNT(*) + 1 FROM issues WHERE status != 'resolved' AND priority_score > ?",
        (issue["priority_score"],)).fetchone()[0] if issue["status"] != "resolved" else None
    return issue


# ----------------------------------------------------------------------------- routes

@app.get("/api/health")
def health():
    out = {"status": "ok", "extractor": extract.active_extractor_name(), "embeddings": embed.backend_name()}
    if out["extractor"] == "ollama":
        from . import config, ollama
        models = ollama.installed_models()
        out["ollama"] = {"reachable": ollama.available(), "text_model": config.OLLAMA_TEXT_MODEL,
                         "vision_model": config.OLLAMA_VISION_MODEL,
                         "text_model_installed": config.OLLAMA_TEXT_MODEL in models,
                         "vision_model_installed": config.OLLAMA_VISION_MODEL in models}
    return out


@app.get("/api/meta")
def meta():
    return {
        "categories": [{"key": k, "label": v["label"], "department": v["department"], "sub_types": v["sub_types"]}
                       for k, v in CATEGORIES.items()],
        "localities": [{k: loc[k] for k in ("id", "name", "lat", "lng", "population")} for loc in localities()],
        "departments": sorted({v["department"] for v in CATEGORIES.values()}),
        "statuses": STATUSES,
        "sla_tiers": [{"tier": t, "min_score": m, "hours": h} for m, t, h in sla.TIERS],
    }


@app.post("/api/complaints", status_code=201)
def create_complaint(body: ComplaintIn):
    with _ingest_lock, db.session() as conn:
        try:
            return ingest(conn, text=body.text, lat=body.lat, lng=body.lng, channel=body.channel,
                          image_b64=body.image_base64, image_media_type=body.image_media_type,
                          created_at=body.created_at, reporter_contact=body.reporter_contact)
        except MediaError as exc:
            raise HTTPException(422, str(exc)) from exc


@app.get("/api/complaints")
def list_complaints(limit: int = Query(50, le=500), needs_review: bool | None = None):
    sql, args = "SELECT * FROM complaints", []
    if needs_review is not None:
        sql += " WHERE needs_review = ?"
        args.append(int(needs_review))
    sql += " ORDER BY created_at DESC LIMIT ?"
    with db.session() as conn:
        return [db.complaint_row_to_dict(r) for r in conn.execute(sql, (*args, limit))]


@app.get("/api/issues")
def list_issues(status: str | None = None, category: str | None = None, locality_id: str | None = None,
                department: str | None = None, tier: Literal["critical", "high", "medium", "low"] | None = None,
                since_days: int | None = Query(None, ge=1, le=3650), overdue: bool | None = None,
                sort: Literal["priority", "recent", "reports", "deadline"] = "priority",
                limit: int = Query(100, le=1000)):
    where, args = [], []
    if status == "active":
        where.append("status != 'resolved'")
    elif status:
        where.append("status = ?"); args.append(status)
    for col, val in (("category", category), ("locality_id", locality_id), ("department", department)):
        if val:
            where.append(f"{col} = ?"); args.append(val)
    if tier:
        lo, hi = TIER_RANGES[tier]
        where.append("priority_score >= ? AND priority_score < ?"); args += [lo, hi]
    if since_days:
        where.append("last_reported >= ?"); args.append(iso(utcnow() - timedelta(days=since_days)))
    if overdue is not None:
        where.append("status != 'resolved' AND sla_due_at " + ("<" if overdue else ">=") + " ?")
        args.append(iso(utcnow()))
    order = {"priority": "priority_score DESC", "recent": "last_reported DESC", "reports": "report_count DESC",
             "deadline": "sla_due_at ASC"}[sort]
    sql = "SELECT * FROM issues" + (f" WHERE {' AND '.join(where)}" if where else "") + f" ORDER BY {order} LIMIT ?"
    with db.session() as conn:
        sla.check(conn)
        rows = [_decorate(conn, db.issue_row_to_dict(r)) for r in conn.execute(sql, (*args, limit))]
    for rank, r in enumerate(rows, 1):
        r["rank"] = rank if sort == "priority" else None
    return rows


@app.get("/api/issues/{issue_id}")
def get_issue(issue_id: int):
    with db.session() as conn:
        sla.check(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.patch("/api/issues/{issue_id}")
def patch_issue(issue_id: int, body: IssuePatch):
    now = iso(utcnow())
    with db.session() as conn:
        row = conn.execute("SELECT status, department FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if not row:
            raise HTTPException(404, "issue not found")
        if body.status and body.status != row["status"]:
            resolved_at = now if body.status == "resolved" else None
            conn.execute("UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?", (body.status, resolved_at, issue_id))
            if body.status == "resolved":
                conn.execute("UPDATE issue_tasks SET status = 'done', completed_at = ? WHERE issue_id = ? AND status != 'done'",
                             (now, issue_id))
                msg = "Closed manually without AI photo verification"
            elif row["status"] == "resolved":
                conn.execute("UPDATE issue_tasks SET status = 'open', completed_at = NULL WHERE issue_id = ?", (issue_id,))
                msg = "Reopened"
            else:
                msg = f"Status changed {row['status']} → {body.status}"
            db.log_event(conn, issue_id, now, "status", msg, body.actor)
        if body.assigned_officer:
            conn.execute("UPDATE issues SET assigned_officer = ? WHERE id = ?", (body.assigned_officer, issue_id))
            db.log_event(conn, issue_id, now, "assignment", f"Assigned to {body.assigned_officer}", body.actor)
        if body.department and body.department != row["department"]:
            conn.execute("UPDATE issues SET department = ? WHERE id = ?", (body.department, issue_id))
            conn.execute("UPDATE issue_tasks SET department = ? WHERE issue_id = ? AND role = 'primary'",
                         (body.department, issue_id))
            db.log_event(conn, issue_id, now, "routing", f"Re-routed {row['department']} → {body.department}", body.actor)
        rescore_issue(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.post("/api/issues/{issue_id}/resolve")
def resolve_issue(issue_id: int, body: ResolveIn):
    """Close an issue with evidence. The after-repair photo is checked by AI before the closure is accepted."""
    now = iso(utcnow())
    with db.session() as conn:
        row = conn.execute("SELECT summary, status FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if not row:
            raise HTTPException(404, "issue not found")
        if row["status"] == "resolved":
            raise HTTPException(409, "issue is already resolved")
        try:
            after = save_image(body.after_image_base64, body.after_image_media_type) if body.after_image_base64 else None
        except MediaError as exc:
            raise HTTPException(422, str(exc)) from exc
        befores = [r["image_path"] for r in conn.execute(
            "SELECT image_path FROM complaints WHERE issue_id = ? AND image_path IS NOT NULL", (issue_id,))]

    verdict = verify_resolution(row["summary"], befores, after)  # network call outside the DB transaction
    accepted = verdict["auto_accept"]

    with db.session() as conn:
        conn.execute(
            "UPDATE issues SET status = ?, resolved_at = ?, after_image = COALESCE(?, after_image), "
            "resolution_note = ?, verification = ? WHERE id = ?",
            ("resolved" if accepted else "needs_verification", now if accepted else None, after, body.note,
             json.dumps({**verdict, "checked_at": now}), issue_id))
        if accepted:
            conn.execute("UPDATE issue_tasks SET status = 'done', completed_at = ? WHERE issue_id = ? AND status != 'done'",
                         (now, issue_id))
            db.log_event(conn, issue_id, now, "verification",
                         f"Closure accepted - {'local AI' if verdict['method'] == 'ollama' else 'AI'} verified the after-repair photo ({verdict['confidence']} confidence)", body.officer)
        else:
            db.log_event(conn, issue_id, now, "verification",
                         f"Closure flagged for supervisor review: {verdict['explanation']}", body.officer)
        rescore_issue(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.get("/api/issues/{issue_id}/work-order")
def work_order(issue_id: int):
    with db.session() as conn:
        issue = _issue_detail(conn, issue_id)
    reasons = [f["reason"] for f in (issue["priority_breakdown"] or [])[:3]]
    photos = [c["image_url"] for c in issue["complaints"] if c["image_url"]]
    return {
        "work_order_no": f"WO-{issue['first_reported'][:4]}-{issue_id:05d}",
        "issued_at": iso(utcnow()),
        "issue_id": issue_id,
        "title": issue["summary"],
        "category": CATEGORIES[issue["category"]]["label"],
        "sub_type": issue["sub_type"],
        "location": {
            "locality": issue["locality"], "detail": issue["location_detail"], "lat": issue["lat"], "lng": issue["lng"],
            "precision": issue["geo_precision"],
            "map_url": (f"https://www.openstreetmap.org/?mlat={issue['lat']}&mlon={issue['lng']}#map=18/{issue['lat']}/{issue['lng']}"
                        if issue["lat"] is not None else None),
        },
        "priority": {"score": issue["priority_score"], "tier": issue["sla_tier"], "rank": issue["rank"], "reasons": reasons},
        "deadline": issue["sla"],
        "sla_hours": issue["sla_hours"],
        "assigned_officer": issue["assigned_officer"],
        "status": issue["status"],
        "tasks": issue["tasks"],
        "safety_risk": issue["safety_risk"],
        "evidence": {
            "report_count": issue["report_count"],
            "first_reported": issue["first_reported"],
            "last_reported": issue["last_reported"],
            "citizen_quotes": [c["raw_text"] for c in issue["complaints"][:3]],
            "photos": photos,
        },
        "completion_requirements": [
            "Upload a clear after-repair photo taken from the same spot as the citizen photos",
            "Add a short note describing the work done",
            "Closure is accepted only after the photo is verified",
        ],
    }


@app.get("/api/track/{complaint_id}")
def track(complaint_id: int):
    """Citizen-facing status: what happened to my complaint?"""
    with db.session() as conn:
        c = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not c:
            raise HTTPException(404, "complaint not found")
        i = dict(conn.execute("SELECT * FROM issues WHERE id = ?", (c["issue_id"],)).fetchone())
        rank = conn.execute("SELECT COUNT(*) + 1 FROM issues WHERE status != 'resolved' AND priority_score > ?",
                            (i["priority_score"],)).fetchone()[0]
    others = i["report_count"] - 1
    deadline = sla.status_of(i)
    return {
        "complaint_id": complaint_id, "issue_id": i["id"], "status": i["status"], "department": i["department"],
        "summary": i["summary"], "priority_score": i["priority_score"],
        "priority_rank": rank if i["status"] != "resolved" else None,
        "report_count": i["report_count"], "deadline": deadline,
        "message": (f"Your report was linked with {others} other citizen report{'s' if others != 1 else ''} about the same problem. "
                    if others else "Your report created a new issue. ")
                   + f"It is assigned to {i['department']} and is currently '{i['status'].replace('_', ' ')}'.",
    }


@app.get("/api/alerts")
def alerts():
    with db.session() as conn:
        out = trends.spike_alerts(conn)
        for a in out:
            a["series"] = trends.daily_series(conn, a["locality_id"], a["category"], days=21)
    return out


@app.get("/api/hotspots")
def hotspots(limit: int = 8):
    with db.session() as conn:
        return trends.hotspots(conn, limit)


@app.get("/api/performance")
def performance(days: int = Query(30, ge=7, le=365)):
    with db.session() as conn:
        sla.check(conn)
        return analytics.performance(conn, days)


@app.get("/api/stats")
def stats():
    with db.session() as conn:
        sla.check(conn)
        q = lambda sql, *a: conn.execute(sql, a).fetchone()[0]
        now = iso(utcnow())
        n_complaints = q("SELECT COUNT(*) FROM complaints")
        n_issues = q("SELECT COUNT(*) FROM issues")
        by_cat = {r[0]: r[1] for r in conn.execute(
            "SELECT category, COUNT(*) FROM issues WHERE status != 'resolved' GROUP BY category")}
        by_dept = [{"department": r[0], "open_issues": r[1], "avg_priority": round(r[2], 1), "overdue": r[3]}
                   for r in conn.execute(
            "SELECT department, COUNT(*), AVG(priority_score), SUM(sla_due_at < ?) FROM issues "
            "WHERE status != 'resolved' GROUP BY department ORDER BY COUNT(*) DESC", (now,))]
        return {
            "complaints": n_complaints,
            "issues": n_issues,
            "active_issues": q("SELECT COUNT(*) FROM issues WHERE status != 'resolved'"),
            "resolved_issues": q("SELECT COUNT(*) FROM issues WHERE status = 'resolved'"),
            "duplicates_merged": n_complaints - n_issues,
            "dedup_reduction_pct": round(100 * (1 - n_issues / n_complaints), 1) if n_complaints else 0,
            "needs_review": q("SELECT COUNT(*) FROM complaints WHERE needs_review = 1"),
            "critical_issues": q("SELECT COUNT(*) FROM issues WHERE status != 'resolved' AND priority_score >= 70"),
            "overdue_issues": q("SELECT COUNT(*) FROM issues WHERE status != 'resolved' AND sla_due_at < ?", now),
            "awaiting_verification": q("SELECT COUNT(*) FROM issues WHERE status = 'needs_verification'"),
            "avg_processing_ms": round(q("SELECT COALESCE(AVG(processing_ms), 0) FROM complaints"), 1),
            "by_category": {k: by_cat.get(k, 0) for k in CATEGORIES},
            "by_department": by_dept,
            "extractor": extract.active_extractor_name(),
        }


@app.post("/api/admin/rescore")
def admin_rescore():
    with db.session() as conn:
        return {"rescored": rescore_all(conn)}


@app.get("/api/route/{category}")
def route(category: str):
    if category not in CATEGORIES:
        raise HTTPException(404, "unknown category")
    return {"category": category, "department": department_for(category)}
