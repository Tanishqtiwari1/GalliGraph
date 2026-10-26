"""WhatsApp intake via Twilio: citizens report by text, voice note, photo or shared location and get a
tracking code back in the same chat.

Twilio setup: point the WhatsApp sender's (or sandbox's) "When a message comes in" webhook to
    POST https://<your-app>/api/whatsapp/webhook
and set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (used to verify Twilio's signature and to download media).
Replies are returned as TwiML in the webhook response, so no outbound API call is needed while chatting.

Conversation: messages are collected into a short-lived draft per phone number. When the draft has a
description and a place (a known area/landmark in the text, or a shared WhatsApp location) it is filed
through the same pipeline as the web form. Otherwise the bot asks for the missing piece once.
"""
import base64
import hashlib
import hmac
import logging
import os
import re
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from xml.sax.saxutils import escape

import httpx

from . import notify, public, sla, transcribe
from .geo import match_locality
from .media import MediaError
from .pipeline import ingest
from .taxonomy import CATEGORIES
from .timeutil import iso, parse, utcnow

log = logging.getLogger(__name__)

SESSION_SCHEMA = """
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone       TEXT PRIMARY KEY,
    draft_text  TEXT NOT NULL DEFAULT '',
    image_b64   TEXT,
    image_type  TEXT,
    lat         REAL,
    lng         REAL,
    asked       TEXT,
    updated_at  TEXT NOT NULL
);
"""

DRAFT_TTL = timedelta(minutes=30)
MAX_MEDIA_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_CODE = re.compile(r"\bJA-[A-Z0-9]{4}-[A-Z0-9]{4}\b", re.IGNORECASE)
_GREETING = {"hi", "hii", "hello", "hey", "help", "menu", "start", "namaste", "namaskar", "नमस्ते", "हेलो"}
_CANCEL = {"cancel", "stop", "reset", "radd", "रद्द"}

# At most 5 complaints per phone per hour (a WhatsApp number is a stronger identity than an IP address)
_recent: dict[str, deque] = defaultdict(deque)
_recent_lock = threading.Lock()
PER_PHONE_LIMIT, PER_PHONE_WINDOW_S = 5, 3600


# ----------------------------------------------------------------------------- Twilio plumbing

def signature_ok(urls: list[str], params: dict[str, str], signature: str | None) -> bool:
    """Twilio request validation: base64(HMAC-SHA1(auth_token, url + sorted key/value pairs))."""
    token = os.getenv("TWILIO_AUTH_TOKEN")
    if not token:
        return os.getenv("CIVICPULSE_WHATSAPP_ALLOW_UNSIGNED", "0") == "1"  # local testing only
    if not signature:
        return False
    payload = "".join(f"{k}{params[k]}" for k in sorted(params))
    for url in urls:
        digest = hmac.new(token.encode(), (url + payload).encode(), hashlib.sha1).digest()
        if hmac.compare_digest(base64.b64encode(digest).decode(), signature):
            return True
    return False


def twiml(text: str | None) -> str:
    body = f"<Message>{escape(text)}</Message>" if text else ""
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>'


def reply_via_api() -> bool:
    """Twilio's WhatsApp trial ("Try out WhatsApp") ignores TwiML replies, so by default replies are sent with the
    Messages API whenever credentials are configured. CIVICPULSE_WHATSAPP_REPLY=twiml forces in-response replies."""
    mode = os.getenv("CIVICPULSE_WHATSAPP_REPLY", "auto").lower()
    if mode == "twiml":
        return False
    return bool(os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"))


def send(to: str, sender: str | None, text: str) -> None:
    """Send a WhatsApp message through Twilio's Messages API (WhatsApp limits one message to 1,600 characters)."""
    sid, token = os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN")
    sender = sender or os.getenv("TWILIO_WHATSAPP_FROM", "")
    if not sender.startswith("whatsapp:"):
        sender = f"whatsapp:{sender}"
    if not to.startswith("whatsapp:"):
        to = f"whatsapp:{to}"
    resp = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", auth=(sid, token),
                      data={"From": sender, "To": to, "Body": text[:1600]}, timeout=20)
    if resp.status_code >= 300:
        log.warning("WhatsApp reply failed (%s): %s", resp.status_code, resp.text[:200])


def _download(url: str) -> tuple[bytes, str]:
    sid, token = os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN")
    auth = (sid, token) if sid and token else None
    resp = httpx.get(url, auth=auth, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    if len(resp.content) > MAX_MEDIA_BYTES:
        raise ValueError("media too large")
    return resp.content, resp.headers.get("content-type", "")


def _phone(sender: str) -> str:
    raw = sender.removeprefix("whatsapp:").strip()
    return notify.normalize_phone(raw) or ("+" + re.sub(r"\D", "", raw))


def _allow(phone: str) -> bool:
    now = time.monotonic()
    with _recent_lock:
        q = _recent[phone]
        while q and now - q[0] > PER_PHONE_WINDOW_S:
            q.popleft()
        return len(q) < PER_PHONE_LIMIT


def _count(phone: str) -> None:
    with _recent_lock:
        _recent[phone].append(time.monotonic())


# ----------------------------------------------------------------------------- drafts

def _load(conn: sqlite3.Connection, phone: str) -> dict:
    row = conn.execute("SELECT * FROM whatsapp_sessions WHERE phone = ?", (phone,)).fetchone()
    if row and utcnow() - parse(row["updated_at"]) <= DRAFT_TTL:
        return dict(row)
    return {"phone": phone, "draft_text": "", "image_b64": None, "image_type": None, "lat": None, "lng": None, "asked": None}


def _save(conn: sqlite3.Connection, d: dict) -> None:
    conn.execute(
        "INSERT INTO whatsapp_sessions (phone, draft_text, image_b64, image_type, lat, lng, asked, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET draft_text = excluded.draft_text, "
        "image_b64 = excluded.image_b64, image_type = excluded.image_type, lat = excluded.lat, lng = excluded.lng, "
        "asked = excluded.asked, updated_at = excluded.updated_at",
        (d["phone"], d["draft_text"], d["image_b64"], d["image_type"], d["lat"], d["lng"], d["asked"], iso(utcnow())))


def _clear(conn: sqlite3.Connection, phone: str) -> None:
    conn.execute("DELETE FROM whatsapp_sessions WHERE phone = ?", (phone,))


# ----------------------------------------------------------------------------- messages

WELCOME = ("🙏 Namaste! This is GalliGraph, your city's complaint helpline.\n\n"
           "Tell us the problem and where it is, in Hindi, Hinglish or English:\n"
           "• type it, e.g. \"Raja Park gali 5 mein bada gaddha hai\"\n"
           "• or send a 🎤 voice note\n"
           "• add a 📷 photo and 📍 location if you can\n\n"
           "Check a complaint: send its code (JA-XXXX-XXXX). Start over: send CANCEL.")


def _receipt(result: dict, heard: str | None) -> str:
    r = public.complaint_receipt(result)
    u = r["understood"]
    cat = CATEGORIES.get(u["category"], {}).get("label", u["category"])
    due = r["deadline"].get("due_at")
    hours = sla.policy().get(r["tier"])
    lines = []
    if heard:
        lines.append(f"🎤 We heard: \"{heard[:300]}\"\n")
    lines += ["✅ Complaint registered / शिकायत दर्ज हो गई", "",
              f"Tracking code: *{r['tracking_code']}*",
              f"Problem: {u.get('summary_en') or cat}",
              f"Goes to: {r['department']}"]
    if u.get("safety_risk"):
        urgent = r["tier"] in ("critical", "high")
        lines.append("⚠️ Safety risk: marked urgent" if urgent else "⚠️ Safety risk noted for the officer")
    if hours:
        lines.append(f"Target: fix within {_hours_text(hours)}" + (f" (by {_ist(due, '%d %b')})" if due else ""))
    if r["merged"] and r["report_count"] > 1:
        lines.append(f"👥 {r['report_count'] - 1} other citizen(s) already reported this; your report was added to theirs.")
    lines += ["", "We'll message you here when it's fixed. To check status, send your code anytime.",
              f"Track online: {notify.public_base_url()}/#track/{r['tracking_code']}"]
    return "\n".join(lines)


def _ist(ts: str, fmt: str) -> str:
    """Citizens read times in Indian Standard Time; the database stores UTC."""
    return (parse(ts) + timedelta(hours=5, minutes=30)).strftime(fmt)


def _hours_text(h: float) -> str:
    return f"{int(h)} hours" if h < 48 else f"{round(h / 24)} days"


def _status(conn: sqlite3.Connection, code: str) -> str:
    t = public.track(conn, code)
    if not t:
        return f"We couldn't find {code.upper()}. Please check the code (it looks like JA-XXXX-XXXX)."
    stage = t["stages"][-1]["label"] if t.get("stages") else t["status"]
    lines = [f"📋 *{t['tracking_code']}*: {t['label']}", f"Status: {stage}", f"Department: {t['department']}"]
    due = t.get("deadline", {}).get("due_at")
    if due and t["status"] not in ("resolved", "rejected"):
        lines.append(f"Target date: {_ist(due, '%d %b, %I:%M %p')} IST")
    if t.get("escalated"):
        lines.append("⏫ The deadline was missed, so it was escalated to a senior officer.")
    if t.get("info_request"):
        lines.append(f"❓ The officer asks: {t['info_request']}")
    if t.get("resolution_note"):
        lines.append(f"🔧 Work done: {t['resolution_note']}")
    lines.append(f"Details: {notify.public_base_url()}/#track/{t['tracking_code']}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- main handler

def handle(conn: sqlite3.Connection, form: dict[str, str]) -> str:
    """Process one inbound WhatsApp message and return the reply text."""
    phone = _phone(form.get("From", ""))
    body = (form.get("Body") or "").strip()
    low = body.lower()

    if low in _CANCEL:
        _clear(conn, phone)
        return "Okay, cleared. Send a new complaint whenever you're ready."
    code = _CODE.search(body)
    if code and len(body) <= 30:
        return _status(conn, code.group(0))

    d = _load(conn, phone)
    if low in _GREETING and not d["draft_text"]:
        return WELCOME

    heard = None
    notes = []
    for i in range(min(int(form.get("NumMedia") or 0), 3)):
        url, ctype = form.get(f"MediaUrl{i}"), (form.get(f"MediaContentType{i}") or "").split(";")[0].lower()
        if not url:
            continue
        try:
            if ctype in IMAGE_TYPES and not d["image_b64"]:
                data, _ = _download(url)
                d["image_b64"], d["image_type"] = base64.b64encode(data).decode(), ctype
            elif ctype.startswith("audio/"):
                if not transcribe.available():
                    notes.append("Voice notes aren't enabled yet. Please type your complaint.")
                    continue
                data, _ = _download(url)
                t = transcribe.transcribe(data, ctype)
                heard = t.text
                body = f"{body} {t.for_ai()}".strip()
        except transcribe.TranscribeError as exc:
            notes.append(f"🎤 {exc}")
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("WhatsApp media download failed: %s", exc)
            notes.append("We couldn't open one of the attachments. Please try sending it again.")

    if form.get("Latitude") and form.get("Longitude"):
        try:
            d["lat"], d["lng"] = float(form["Latitude"]), float(form["Longitude"])
        except ValueError:
            pass
    if body and low not in _GREETING:
        d["draft_text"] = f"{d['draft_text']} {body}".strip()

    text = d["draft_text"]
    has_place = d["lat"] is not None or match_locality(text) is not None
    prefix = ("\n".join(notes) + "\n\n") if notes else ""

    if len(text) < 10:
        _save(conn, d)
        if d["image_b64"] or d["lat"] is not None:
            return prefix + "Got it 👍 Now tell us what the problem is (type it or send a voice note)."
        return prefix + (WELCOME if not notes else "Please describe the problem and where it is.")
    if not has_place and d["asked"] != "location":
        d["asked"] = "location"
        _save(conn, d)
        heard_line = f"🎤 We heard: \"{heard[:200]}\"\n\n" if heard else ""
        return (prefix + heard_line + "📍 Where is this? Send the area and a landmark (e.g. \"Malviya Nagar, near "
                "Gaurav Tower\") or share your location using 📎 → Location.")

    if not _allow(phone):
        return "You've sent several complaints in the last hour. Please try again later, or reply with a tracking code to check one."
    try:
        result = ingest(conn, text=text[:3000], lat=d["lat"], lng=d["lng"], channel="whatsapp",
                        image_b64=d["image_b64"], image_media_type=d["image_type"],
                        reporter_contact=phone, sms_opt_in=True)
    except MediaError:
        result = ingest(conn, text=text[:3000], lat=d["lat"], lng=d["lng"], channel="whatsapp",
                        reporter_contact=phone, sms_opt_in=True)
    _count(phone)
    _clear(conn, phone)
    return prefix + _receipt(result, heard)

