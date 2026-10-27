"""CivicPulse API. Run: uvicorn app.main:app --reload (from backend/).

Two audiences:
  * Citizens (no login): report, track by private code, see the public city map and statistics.
  * Officials (login): the full issue queue, actions, work orders, verification and accountability.
"""
import hashlib
import json
import logging
import os
import re
import threading
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response as RawResponse
from pydantic import BaseModel, Field

from . import (analytics, auth, config, db, embed, extract, notify, officer, public, retention, security, sla,
               transcribe, trends, whatsapp)
from .geo import localities, locality_by_id
from .media import UPLOAD_DIR, MediaError, clean_image, save_image
from .pipeline import ingest, rescore_all, rescore_issue
from .taxonomy import CATEGORIES, department_for
from .timeutil import iso, utcnow
from .verify import verify_resolution

log = logging.getLogger(__name__)
STATUSES = ["open", "info_requested", "assigned", "in_progress", "needs_verification", "resolved", "rejected"]
TIER_RANGES = {"critical": (70, 101), "high": (50, 70), "medium": (30, 50), "low": (0, 30)}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    with db.session() as conn:
        auth.init_users(conn)
        sla.load_policy(conn)
        rescore_all(conn)  # durations age, so refresh scores (and deadlines) on boot
    retention.purge()
    retention.start_background()
    yield


# Interactive API docs are a map of every endpoint, so they are only served outside production.
_docs = {} if not config.PRODUCTION else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="GalliGraph API", version="0.3.0", lifespan=lifespan, **_docs,
              description="AI triage for civic complaints: extract, deduplicate, prioritise, route, track, verify.")
security.install(app)
if config.CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.include_router(officer.router)

# SQLite has a single writer; serialising ingestion also keeps dedup decisions race-free.
_ingest_lock = threading.Lock()
Official = Depends(auth.require_official)
Supervisor = Depends(auth.require_supervisor)


# ----------------------------------------------------------------------------- models

ImageType = Literal["image/jpeg", "image/png", "image/webp", "image/gif"]


class ComplaintIn(BaseModel):
    text: str = Field(min_length=10, max_length=3000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    channel: Literal["web", "whatsapp", "email", "app"] = "web"
    image_base64: str | None = Field(default=None, max_length=7_000_000, description="Optional photo, base64 without data: prefix")
    image_media_type: ImageType | None = None
    category_hint: str | None = Field(default=None, max_length=40, description="Category tile the citizen picked")
    phone: str | None = Field(default=None, max_length=20, description="Optional Indian mobile number for SMS updates")
    sms_opt_in: bool = False


class EscalateIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class IssuePatch(BaseModel):
    status: Literal["open", "assigned", "in_progress", "needs_verification", "resolved"] | None = None
    department: str | None = None
    assigned_officer: str | None = Field(default=None, max_length=100)
    reason: str | None = Field(default=None, max_length=500, description="Required when re-routing to another department")


class NotifyIn(BaseModel):
    phone: str = Field(min_length=10, max_length=20)


class FeedbackIn(BaseModel):
    verdict: Literal["fixed", "not_fixed"]
    note: str | None = Field(default=None, max_length=1000)


class ReplyIn(BaseModel):
    text: str = Field(min_length=3, max_length=2000)


class ResolveIn(BaseModel):
    note: str | None = Field(default=None, max_length=2000)
    after_image_base64: str | None = Field(default=None, max_length=7_000_000)
    after_image_media_type: ImageType | None = None


# ----------------------------------------------------------------------------- helpers

def _decorate(issue: dict) -> dict:
    issue["locality"] = locality_by_id().get(issue["locality_id"] or "", {}).get("name")
    issue["sla"] = sla.status_of(issue)
    return issue


def _issue_detail(conn, issue_id: int) -> dict:
    row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    if not row:
        raise HTTPException(404, "issue not found")
    issue = _decorate(db.issue_row_to_dict(row))
    issue["complaints"] = [db.complaint_row_to_dict(r) for r in conn.execute(
        "SELECT * FROM complaints WHERE issue_id = ? ORDER BY created_at", (issue_id,))]
    issue["tasks"] = [dict(r) for r in conn.execute(
        "SELECT * FROM issue_tasks WHERE issue_id = ? ORDER BY role DESC, id", (issue_id,))]
    issue["events"] = [dict(r) for r in conn.execute(
        "SELECT at, kind, message, actor FROM issue_events WHERE issue_id = ? ORDER BY at, id", (issue_id,))]
    issue["rank"] = conn.execute(
        "SELECT COUNT(*) + 1 FROM issues WHERE status NOT IN ('resolved', 'rejected') AND priority_score > ?",
        (issue["priority_score"],)).fetchone()[0] if issue["status"] != "resolved" else None
    return issue


def get_issue_detail(issue_id: int) -> dict:
    with db.session() as conn:
        return _issue_detail(conn, issue_id)


def _sql_str(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


def _actor(user: dict) -> str:
    return f"{user['display_name']} ({user['username']})"


# ============================================================================= public (citizens)

@app.api_route("/api/health", methods=["GET", "HEAD"])  # HEAD: uptime monitors
def health():
    from . import classifier, verify

    out = {"status": "ok", "extractor": extract.active_extractor_name(), "embeddings": embed.backend_name(),
           "photo_verifier": verify.active_verifier(), "trained_model": None, "demo_data": config.DEMO_DATA,
           "sms_provider": notify.provider(), "voice_notes": transcribe.engine(),
           "whatsapp": bool(os.getenv("TWILIO_AUTH_TOKEN"))}
    bundle = classifier._load()
    if bundle:
        out["trained_model"] = {k: bundle[k] for k in ("source", "trained_on", "test_accuracy")}
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
def create_complaint(body: ComplaintIn, request: Request):
    auth.complaint_limiter.check(request)
    phone = notify.normalize_phone(body.phone) if body.sms_opt_in else None
    if body.sms_opt_in and body.phone and not phone:
        raise HTTPException(422, "Enter a valid 10-digit Indian mobile number")
    with _ingest_lock, db.session() as conn:
        try:
            result = ingest(conn, text=body.text, lat=body.lat, lng=body.lng, channel=body.channel,
                            image_b64=body.image_base64, image_media_type=body.image_media_type,
                            category_hint=body.category_hint, reporter_contact=phone, sms_opt_in=bool(phone))
        except MediaError as exc:
            raise HTTPException(422, str(exc)) from exc
    return public.complaint_receipt(result)


_preview_limiter = auth.RateLimiter(limit=30, window_s=600)
_voice_limiter = auth.RateLimiter(limit=20, window_s=600)
_whatsapp_lock = threading.Lock()


class VoiceIn(BaseModel):
    audio_base64: str = Field(min_length=10, max_length=12_000_000)
    media_type: str = Field(max_length=60)


@app.post("/api/transcribe")
def transcribe_voice(body: VoiceIn, request: Request):
    """Citizen voice note -> text (Hindi/English), so people who can't type can still report. Audio is not stored."""
    _voice_limiter.check(request)
    try:
        t = transcribe.transcribe_b64(body.audio_base64, body.media_type)
    except transcribe.TranscribeError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"text": t.text, "language": t.language, "english": t.english, "for_ai": t.for_ai(),
            "seconds": t.seconds, "engine": t.engine}


@app.post("/api/whatsapp/webhook", include_in_schema=False)
async def whatsapp_webhook(request: Request):
    """Twilio WhatsApp inbound messages (form-encoded). Replies with TwiML."""
    from urllib.parse import parse_qsl

    form = dict(parse_qsl((await request.body()).decode("utf-8", "replace"), keep_blank_values=True))
    path = "/api/whatsapp/webhook"
    urls = [notify.public_base_url() + path, str(request.url).replace("http://", "https://", 1), str(request.url)]
    if not whatsapp.signature_ok(urls, form, request.headers.get("X-Twilio-Signature")):
        raise HTTPException(403, "Invalid signature")
    import anyio

    def run() -> str:
        with _whatsapp_lock, _ingest_lock, db.session() as conn:
            return whatsapp.handle(conn, form)

    try:
        reply = await anyio.to_thread.run_sync(run)
    except Exception:
        log.exception("WhatsApp message failed")
        reply = "Sorry, something went wrong on our side. Please try again in a minute."
    if whatsapp.reply_via_api():
        # Reply from the number the citizen wrote to (form "To"), e.g. the trial or sandbox sender
        await anyio.to_thread.run_sync(whatsapp.send, form.get("From", ""), form.get("To"), reply)
        return RawResponse(content=whatsapp.twiml(None), media_type="application/xml")
    return RawResponse(content=whatsapp.twiml(reply), media_type="application/xml")


@app.post("/api/complaints/preview")
def preview_complaint(body: ComplaintIn, request: Request):
    """'Review before you submit': what the AI understood and where it will go. Nothing is saved."""
    _preview_limiter.check(request)
    from .geo import geocode
    from .priority import score as priority_score

    image_b64, image_type = body.image_base64, body.image_media_type
    if image_b64:
        try:
            image_b64, image_type = clean_image(image_b64, image_type)
        except MediaError as exc:
            raise HTTPException(422, str(exc)) from exc
    ex, extractor = extract.extract(body.text, image_b64, image_type)
    if body.category_hint and ex.category == "other" and body.category_hint in CATEGORIES:
        ex.category, ex.sub_type = body.category_hint, "other"
    geo = geocode(ex.location_text, body.text, body.lat, body.lng)
    fake = {"id": -1, "category": ex.category, "severity": ex.severity, "safety_risk": int(ex.safety_risk),
            "locality_id": geo.locality_id, "lat": geo.lat, "lng": geo.lng, "geo_precision": geo.precision,
            "report_count": 1, "confirmations": 0, "first_reported": iso(utcnow()),
            "reported_duration_days": ex.duration_days, "spot_keys": "[]"}
    with db.session() as conn:
        total, _ = priority_score(conn, fake)
    tier, hours = sla.tier_for(total)
    loc = locality_by_id().get(geo.locality_id or "", {}).get("name")
    return {"understood": ex.model_dump(), "extractor": extractor, "locality": loc, "geo_precision": geo.precision,
            "department": department_for(ex.category),
            "secondary_department": department_for(ex.secondary_category) if ex.secondary_category else None,
            "estimated_priority": total, "tier": tier, "deadline_hours": hours}


def _complaint_by_code(conn, code: str):
    if not re.fullmatch(r"(?i)JA-[A-Z0-9]{4}-[A-Z0-9]{4}", code.strip()):
        raise HTTPException(404, "No complaint found with that tracking code")
    c = conn.execute("SELECT id, issue_id FROM complaints WHERE tracking_code = ?", (code.strip().upper(),)).fetchone()
    if not c:
        raise HTTPException(404, "No complaint found with that tracking code")
    return c


_feedback_limiter = auth.RateLimiter(limit=20, window_s=600)


@app.post("/api/track/{code}/feedback")
def citizen_feedback(code: str, body: FeedbackIn, request: Request):
    """Citizen confirms or disputes a fix. A dispute starts a review; it does not decide the outcome."""
    _feedback_limiter.check(request)
    now = iso(utcnow())
    with db.session() as conn:
        c = _complaint_by_code(conn, code)
        i = conn.execute("SELECT status FROM issues WHERE id = ?", (c["issue_id"],)).fetchone()
        if i["status"] not in ("resolved", "needs_verification"):
            raise HTTPException(409, "Feedback opens once the department reports the problem as fixed")
        note = f": {body.note.strip()}" if body.note and body.note.strip() else ""
        if body.verdict == "fixed":
            conn.execute("UPDATE issues SET citizen_confirmed = citizen_confirmed + 1 WHERE id = ?", (c["issue_id"],))
            db.log_event(conn, c["issue_id"], now, "citizen_feedback", f"Citizen confirmed the fix{note}", "citizen")
        else:
            conn.execute("UPDATE issues SET disputed = 1, status = 'needs_verification', resolved_at = NULL WHERE id = ?",
                         (c["issue_id"],))
            db.log_event(conn, c["issue_id"], now, "dispute", f"Citizen says the problem persists - sent for review{note}", "citizen")
        rescore_issue(conn, c["issue_id"])
        return public.track(conn, code)


@app.post("/api/track/{code}/reply")
def citizen_reply(code: str, body: ReplyIn, request: Request):
    """Citizen answers an officer's request for more information."""
    _feedback_limiter.check(request)
    with db.session() as conn:
        c = _complaint_by_code(conn, code)
        i = conn.execute("SELECT status FROM issues WHERE id = ?", (c["issue_id"],)).fetchone()
        if i["status"] != "info_requested":
            raise HTTPException(409, "No information has been requested for this complaint")
        conn.execute("UPDATE issues SET status = 'open', info_request = NULL WHERE id = ?", (c["issue_id"],))
        db.log_event(conn, c["issue_id"], iso(utcnow()), "info_reply", f"Citizen replied: {body.text.strip()}", "citizen")
        rescore_issue(conn, c["issue_id"])
        return public.track(conn, code)


@app.post("/api/track/{code}/notify")
def citizen_notify_opt_in(code: str, body: NotifyIn, request: Request):
    """Add a mobile number later to get an SMS when the issue is resolved."""
    _feedback_limiter.check(request)
    phone = notify.normalize_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Enter a valid 10-digit Indian mobile number")
    with db.session() as conn:
        c = _complaint_by_code(conn, code)
        conn.execute("UPDATE complaints SET reporter_contact = ?, sms_opt_in = 1 WHERE id = ?", (phone, c["id"]))
    return {"ok": True, "to": notify.mask(phone)}


@app.delete("/api/track/{code}/notify")
def citizen_notify_opt_out(code: str, request: Request):
    """Withdraw consent: stop updates and erase the citizen's phone number from this complaint."""
    _feedback_limiter.check(request)
    with db.session() as conn:
        c = _complaint_by_code(conn, code)
        conn.execute("UPDATE complaints SET reporter_contact = NULL, sms_opt_in = 0 WHERE id = ?", (c["id"],))
    return {"ok": True}


# Tracking codes are the only key to a citizen's complaint, so guessing them is rate limited
_track_limiter = auth.RateLimiter(limit=60, window_s=600)


@app.get("/api/track/{code}/evidence")
def resolution_evidence(code: str, request: Request):
    """The department's after-repair photo is shown to the citizen who reported (their own complaint only)."""
    _track_limiter.check(request)
    with db.session() as conn:
        c = _complaint_by_code(conn, code)
        i = conn.execute("SELECT after_image FROM issues WHERE id = ?", (c["issue_id"],)).fetchone()
    if not i or not i["after_image"]:
        raise HTTPException(404, "No resolution photo yet")
    path = UPLOAD_DIR / i["after_image"]
    if not path.is_file():
        raise HTTPException(404, "No resolution photo yet")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=600"})


@app.get("/api/track/{code}")
def track(code: str, request: Request):
    _track_limiter.check(request)
    if not re.fullmatch(r"(?i)JA-[A-Z0-9]{4}-[A-Z0-9]{4}", code.strip()):
        raise HTTPException(404, "No complaint found with that tracking code")
    with db.session() as conn:
        out = public.track(conn, code)
    if out is None:
        raise HTTPException(404, "No complaint found with that tracking code")
    return out


_confirmed: set[tuple[str, int]] = set()
_confirm_limiter = auth.RateLimiter(limit=30, window_s=600)


@app.post("/api/public/issues/{issue_id}/confirm")
def confirm_issue(issue_id: int, request: Request):
    """'I have this too (+1)': a resident confirms an existing problem without filing a duplicate complaint."""
    _confirm_limiter.check(request)
    key = (hashlib.sha256(auth.client_ip(request).encode()).hexdigest()[:16], issue_id)  # no raw IPs kept
    with db.session() as conn:
        row = conn.execute("SELECT status, confirmations FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if not row or row["status"] == "resolved":
            raise HTTPException(404, "This problem is not open")
        if key in _confirmed:
            return {"confirmations": row["confirmations"], "already": True}
        if len(_confirmed) > 100_000:
            _confirmed.clear()
        _confirmed.add(key)
        conn.execute("UPDATE issues SET confirmations = confirmations + 1 WHERE id = ?", (issue_id,))
        db.log_event(conn, issue_id, iso(utcnow()), "confirmation", "A resident confirmed this problem (+1)", "citizen")
        rescore_issue(conn, issue_id)
        return {"confirmations": row["confirmations"] + 1, "already": False}


@app.get("/api/public/map")
def public_map(category: str | None = None, resolved_days: int = Query(30, ge=0, le=365)):
    with db.session() as conn:
        sla.check(conn)
        return public.map_points(conn, resolved_days, category)


@app.get("/api/public/summary")
def public_summary(days: int = Query(30, ge=7, le=365)):
    with db.session() as conn:
        sla.check(conn)
        return public.summary(conn, days)


# ============================================================================= official accounts

@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    auth.login_limiter.check(request)
    auth.account_login_limiter.check(request, key="user:" + body.username.strip().lower())
    user = auth.authenticate(body.username, body.password)
    if user is None:
        raise HTTPException(401, "Wrong username or password")
    response.set_cookie(auth.COOKIE, auth.make_token(user), max_age=auth.SESSION_HOURS * 3600, httponly=True,
                        samesite="strict", secure=auth.cookie_secure(request), path="/")
    return user


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    user = auth.current_user(request)
    if user:
        with db.session() as conn:
            auth.revoke_sessions(conn, user["id"])  # the old cookie stops working even if it was copied
    response.delete_cookie(auth.COOKIE, path="/", httponly=True, samesite="strict", secure=auth.cookie_secure(request))
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Official):
    return user


# ============================================================================= officials only

@app.get("/api/media/{name}")
def media(name: str, _user: dict = Official):
    """Evidence photos may show faces or homes, so only logged-in officials can open them."""
    if not re.fullmatch(r"[0-9a-f]{32}\.(jpg|png|webp|gif)", name):
        raise HTTPException(404, "not found")
    path = UPLOAD_DIR / name
    if not path.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/complaints")
def list_complaints(limit: int = Query(50, le=500), needs_review: bool | None = None, _user: dict = Official):
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
                limit: int = Query(100, le=1000), untriaged: bool | None = None, unassigned: bool | None = None,
                disputed: bool | None = None, user: dict = Official):
    where, args = [], []
    if officer.scope(user):
        where.append("department = ?"); args.append(officer.scope(user))
    if untriaged:
        where.append("reviewed_at IS NULL AND status NOT IN ('resolved', 'rejected')")
    if unassigned:
        where.append("status IN ('open', 'info_requested') AND assigned_officer IS NULL")
    if disputed:
        where.append("disputed = 1")
    if status == "active":
        where.append("status NOT IN ('resolved', 'rejected')")
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
        where.append("status NOT IN ('resolved', 'rejected') AND sla_due_at " + ("<" if overdue else ">=") + " ?")
        args.append(iso(utcnow()))
    order = {"priority": "priority_score DESC", "recent": "last_reported DESC", "reports": "report_count DESC",
             "deadline": "sla_due_at ASC"}[sort]
    sql = "SELECT * FROM issues" + (f" WHERE {' AND '.join(where)}" if where else "") + f" ORDER BY {order} LIMIT ?"
    with db.session() as conn:
        sla.check(conn)
        rows = [_decorate(db.issue_row_to_dict(r)) for r in conn.execute(sql, (*args, limit))]
        # Citizens quote their JA-XXXX-XXXX tracking code, so officers must be able to search by it
        codes: dict[int, list[str]] = {}
        for c in conn.execute("SELECT issue_id, tracking_code FROM complaints WHERE tracking_code IS NOT NULL"):
            codes.setdefault(c["issue_id"], []).append(c["tracking_code"])
        for r in rows:
            r["tracking_codes"] = codes.get(r["id"], [])
    for rank, r in enumerate(rows, 1):
        r["rank"] = rank if sort == "priority" else None
    return rows


@app.get("/api/issues/{issue_id}")
def get_issue(issue_id: int, user: dict = Official):
    with db.session() as conn:
        officer.check_access(conn, user, issue_id)
        sla.check(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.patch("/api/issues/{issue_id}")
def patch_issue(issue_id: int, body: IssuePatch, user: dict = Official):
    now = iso(utcnow())
    actor = _actor(user)
    with db.session() as conn:
        row = officer.check_access(conn, user, issue_id)
        if body.department and body.department != row["department"] and not (body.reason and len(body.reason.strip()) >= 3):
            raise HTTPException(422, "Give a reason for re-routing to another department")
        if body.status and body.status != row["status"]:
            # Closing without photo verification, or overruling a flagged closure, is a supervisor decision.
            if (body.status == "resolved" or row["status"] == "needs_verification") and user["role"] != "supervisor":
                raise HTTPException(403, "Only a supervisor can close an issue without verification or overrule a "
                                         "flagged closure. Use 'Submit for closure' with a photo instead.")
            resolved_at = now if body.status == "resolved" else None
            conn.execute("UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?", (body.status, resolved_at, issue_id))
            if body.status == "resolved":
                conn.execute("UPDATE issue_tasks SET status = 'done', completed_at = ? WHERE issue_id = ? AND status != 'done'",
                             (now, issue_id))
                full = conn.execute("SELECT category, sub_type, locality_id FROM issues WHERE id = ?", (issue_id,)).fetchone()
                loc = locality_by_id().get(full["locality_id"] or "", {}).get("name")
                notify.notify_resolved(conn, issue_id, public._label(full["category"], full["sub_type"], loc))
                msg = ("Supervisor approved the closure after resolution review" if row["status"] == "needs_verification"
                       else "Closed manually by supervisor without photo review")
                conn.execute("UPDATE issues SET disputed = 0 WHERE id = ?", (issue_id,))
            elif row["status"] == "resolved":
                conn.execute("UPDATE issue_tasks SET status = 'open', completed_at = NULL WHERE issue_id = ?", (issue_id,))
                msg = "Reopened"
            elif row["status"] == "needs_verification":
                msg = "Supervisor rejected the closure - sent back for repair"
                conn.execute("UPDATE issues SET disputed = 0 WHERE id = ?", (issue_id,))
            else:
                msg = f"Status changed {row['status'].replace('_', ' ')} → {body.status.replace('_', ' ')}"
            db.log_event(conn, issue_id, now, "status", msg, actor)
        if body.assigned_officer:
            conn.execute("UPDATE issues SET assigned_officer = ? WHERE id = ?", (body.assigned_officer, issue_id))
            db.log_event(conn, issue_id, now, "assignment", f"Assigned to {body.assigned_officer}", actor)
        if body.department and body.department != row["department"]:
            conn.execute("UPDATE issues SET department = ? WHERE id = ?", (body.department, issue_id))
            conn.execute("UPDATE issue_tasks SET department = ? WHERE issue_id = ? AND role = 'primary'",
                         (body.department, issue_id))
            db.log_event(conn, issue_id, now, "routing", f"Re-routed {row['department']} → {body.department}. Reason: {body.reason.strip()}", actor)
        rescore_issue(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.post("/api/issues/{issue_id}/resolve")
def resolve_issue(issue_id: int, body: ResolveIn, user: dict = Official):
    """Close an issue with evidence. The after-repair photo is checked by AI before the closure is accepted."""
    now = iso(utcnow())
    actor = _actor(user)
    with db.session() as conn:
        row = officer.check_access(conn, user, issue_id)
        if row["status"] in sla.CLOSED:
            raise HTTPException(409, "issue is already closed")
        try:
            after = save_image(body.after_image_base64, body.after_image_media_type) if body.after_image_base64 else None
        except MediaError as exc:
            raise HTTPException(422, str(exc)) from exc
        befores = [r["image_path"] for r in conn.execute(
            "SELECT image_path FROM complaints WHERE issue_id = ? AND image_path IS NOT NULL", (issue_id,))]

    verdict = verify_resolution(row["summary"], befores, after)  # network call outside the DB transaction
    # AI only flags or supports; a person approves every closure (supervisor resolution review).
    accepted = False

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
                         f"Closure accepted - {'local AI' if verdict['method'] == 'ollama' else 'AI'} verified the "
                         f"after-repair photo ({verdict['confidence']} confidence)", actor)
        else:
            ai = {"resolved": "photo appears to show the fix", "not_resolved": "photo does NOT appear to show the fix",
                  "unclear": "could not judge the photo"}[verdict["verdict"]]
            db.log_event(conn, issue_id, now, "verification",
                         f"Fix reported{' with photo' if after else ' without a photo'} - sent for resolution review. "
                         f"AI check: {ai}" + (f" ({verdict['confidence']} confidence)" if verdict["method"] != "none" else ""), actor)
        rescore_issue(conn, issue_id)
        return _issue_detail(conn, issue_id)


@app.post("/api/issues/{issue_id}/escalate")
def escalate_issue(issue_id: int, body: EscalateIn, user: dict = Official):
    with db.session() as conn:
        row = officer.check_access(conn, user, issue_id)
        if row["status"] == "resolved":
            raise HTTPException(409, "issue is already resolved")
        level = min(2, row["escalation_level"] + 1)
        conn.execute("UPDATE issues SET escalation_level = ? WHERE id = ?", (level, issue_id))
        db.log_event(conn, issue_id, iso(utcnow()), "escalation",
                     f"Escalated to {sla.ESCALATION_TARGET[level]}: {body.reason}", _actor(user))
        return _issue_detail(conn, issue_id)


@app.get("/api/issues/{issue_id}/sms")
def issue_sms(issue_id: int, user: dict = Official):
    with db.session() as conn:
        officer.check_access(conn, user, issue_id)
        return {"provider": notify.provider(), "messages": [dict(r) for r in conn.execute(
            "SELECT to_masked, body, provider, status, error, created_at FROM sms_outbox WHERE issue_id = ? ORDER BY id DESC",
            (issue_id,))]}


@app.get("/api/issues/{issue_id}/work-order")
def work_order(issue_id: int, user: dict = Official):
    with db.session() as conn:
        officer.check_access(conn, user, issue_id)
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


@app.get("/api/alerts")
def alerts(_user: dict = Official):
    with db.session() as conn:
        out = trends.spike_alerts(conn)
        for a in out:
            a["series"] = trends.daily_series(conn, a["locality_id"], a["category"], days=21)
    return out


@app.get("/api/hotspots")
def hotspots(limit: int = 8, _user: dict = Official):
    with db.session() as conn:
        return trends.hotspots(conn, limit)


@app.get("/api/performance")
def performance(days: int = Query(30, ge=7, le=365), user: dict = Official):
    with db.session() as conn:
        sla.check(conn)
        out = analytics.performance(conn, days)
    dept = officer.scope(user)
    if dept:  # city-wide comparisons are for supervisors
        out["departments"] = [d for d in out["departments"] if d["department"] == dept]
        out["wards"] = []
        out["scope"] = dept
    return out


@app.get("/api/stats")
def stats(user: dict = Official):
    dept = officer.scope(user)
    with db.session() as conn:
        sla.check(conn)
        if dept:  # department-scoped officials only see their own department's numbers
            conn.execute("DROP VIEW IF EXISTS temp.scoped_issues")
            conn.execute("CREATE TEMP VIEW scoped_issues AS SELECT * FROM issues WHERE department = " + _sql_str(dept))
        table = "scoped_issues" if dept else "issues"

        def q(sql, *a):
            return conn.execute(sql.replace("FROM issues", f"FROM {table}"), a).fetchone()[0]
        now = iso(utcnow())
        n_complaints = q("SELECT COUNT(*) FROM complaints")
        n_issues = q("SELECT COUNT(*) FROM issues")
        by_cat = {r[0]: r[1] for r in conn.execute(
            f"SELECT category, COUNT(*) FROM {table} WHERE status NOT IN ('resolved', 'rejected') GROUP BY category")}
        by_dept = [{"department": r[0], "open_issues": r[1], "avg_priority": round(r[2], 1), "overdue": r[3]}
                   for r in conn.execute(
            f"SELECT department, COUNT(*), AVG(priority_score), SUM(sla_due_at < ?) FROM {table} "
            "WHERE status NOT IN ('resolved', 'rejected') GROUP BY department ORDER BY COUNT(*) DESC", (now,))]
        return {
            "complaints": n_complaints,
            "issues": n_issues,
            "active_issues": q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected')"),
            "resolved_issues": q("SELECT COUNT(*) FROM issues WHERE status = 'resolved'"),
            "duplicates_merged": n_complaints - n_issues,
            "dedup_reduction_pct": round(100 * (1 - n_issues / n_complaints), 1) if n_complaints else 0,
            "needs_review": q("SELECT COUNT(*) FROM complaints WHERE needs_review = 1"),
            "critical_issues": q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected') AND priority_score >= 70"),
            "overdue_issues": q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected') AND sla_due_at < ?", now),
            "awaiting_verification": q("SELECT COUNT(*) FROM issues WHERE status = 'needs_verification'"),
            "unassigned": q("SELECT COUNT(*) FROM issues WHERE status IN ('open', 'info_requested') AND assigned_officer IS NULL"),
            "untriaged": q("SELECT COUNT(*) FROM issues WHERE reviewed_at IS NULL AND status NOT IN ('resolved', 'rejected')"),
            "disputed": q("SELECT COUNT(*) FROM issues WHERE disputed = 1"),
            "high_priority": q("SELECT COUNT(*) FROM issues WHERE status NOT IN ('resolved', 'rejected') AND priority_score >= 50"),
            "scope": dept,
            "avg_processing_ms": round(q("SELECT COALESCE(AVG(processing_ms), 0) FROM complaints"), 1),
            "by_category": {k: by_cat.get(k, 0) for k in CATEGORIES},
            "by_department": by_dept,
            "extractor": extract.active_extractor_name(),
        }


@app.post("/api/admin/rescore")
def admin_rescore(_user: dict = Supervisor):
    with db.session() as conn:
        return {"rescored": rescore_all(conn)}


@app.get("/api/route/{category}")
def route(category: str):
    if category not in CATEGORIES:
        raise HTTPException(404, "unknown category")
    return {"category": category, "department": department_for(category)}


# ============================================================================= website (production)

@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"], include_in_schema=False)
def api_not_found(rest: str):
    raise HTTPException(404, "not found")


if config.FRONTEND_DIST.is_dir():
    # Serve the built React app: real files directly, every other path falls back to index.html
    # so /official and other client-side routes work on refresh.
    _dist = config.FRONTEND_DIST.resolve()

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str):
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and _dist in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html", headers={"Cache-Control": "no-cache"})
