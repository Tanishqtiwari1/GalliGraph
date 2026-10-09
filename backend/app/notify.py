"""SMS notifications to citizens (opt-in), e.g. "your issue is resolved".

Providers (CIVICPULSE_SMS_PROVIDER):
  * "console" (default): messages are composed and stored in the outbox but not sent - safe for demos.
  * "twilio": sends real SMS via Twilio's REST API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
    A Twilio trial account can only text numbers verified in the Twilio console.

Every attempt is recorded in the sms_outbox table so officials can see what was sent and whether it worked.
Commercial SMS in India also requires DLT template registration with the telecom operator.
"""
import logging
import os
import re
import sqlite3
import threading

import httpx

from . import db
from .timeutil import iso, utcnow

log = logging.getLogger(__name__)

OUTBOX_SCHEMA = """
CREATE TABLE IF NOT EXISTS sms_outbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL,
    issue_id     INTEGER NOT NULL,
    to_masked    TEXT NOT NULL,
    body         TEXT NOT NULL,
    provider     TEXT NOT NULL,
    status       TEXT NOT NULL,
    error        TEXT,
    created_at   TEXT NOT NULL
);
"""

_PHONE = re.compile(r"^(?:\+?91[\s-]?)?0?([6-9]\d{9})$")


def normalize_phone(raw: str | None) -> str | None:
    """Indian mobile numbers only, stored as +91XXXXXXXXXX. Returns None if invalid."""
    if not raw:
        return None
    m = _PHONE.match(re.sub(r"[\s()-]", "", raw.strip()))
    return f"+91{m.group(1)}" if m else None


def mask(phone: str) -> str:
    digits = phone[-10:]
    return f"{digits[:2]}••••••{digits[-2:]}"


def provider() -> str:
    return os.getenv("CIVICPULSE_SMS_PROVIDER", "console").lower()


def public_base_url() -> str:
    return os.getenv("CIVICPULSE_PUBLIC_URL", "http://localhost:5173").rstrip("/")


def _send_twilio(to: str, body: str) -> None:
    sid, token, sender = (os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"), os.getenv("TWILIO_FROM_NUMBER"))
    if not (sid and token and sender):
        raise RuntimeError("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)")
    resp = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                      auth=(sid, token), data={"From": sender, "To": to, "Body": body}, timeout=15)
    if resp.status_code >= 300:
        raise RuntimeError(f"Twilio error {resp.status_code}: {resp.json().get('message', resp.text[:120])}")


def _deliver(rows: list[dict]) -> None:
    """Runs in a background thread so the officer's request isn't slowed by the SMS gateway."""
    prov = provider()
    with db.session() as conn:
        for r in rows:
            status, error = "simulated", None
            if prov == "twilio":
                try:
                    _send_twilio(r["to"], r["body"])
                    status = "sent"
                except (httpx.HTTPError, RuntimeError, ValueError) as exc:
                    status, error = "failed", str(exc)[:300]
                    log.warning("SMS to %s failed: %s", mask(r["to"]), exc)
            else:
                log.info("SMS (console) to %s: %s", mask(r["to"]), r["body"])
            conn.execute(
                "INSERT INTO sms_outbox (complaint_id, issue_id, to_masked, body, provider, status, error, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (r["complaint_id"], r["issue_id"], mask(r["to"]), r["body"], prov, status, error, iso(utcnow())))
        if rows:
            sent = sum(1 for _ in rows)
            word = "simulated (demo mode)" if prov == "console" else "queued"
            db.log_event(conn, rows[0]["issue_id"], iso(utcnow()), "sms",
                         f"Resolution SMS {word} to {sent} citizen{'s' if sent != 1 else ''}", "system")


def notify_resolved(conn: sqlite3.Connection, issue_id: int, label: str) -> int:
    """Text every opted-in citizen who reported this issue. Returns how many messages were queued."""
    rows = []
    for c in conn.execute(
            "SELECT id, tracking_code, reporter_contact FROM complaints WHERE issue_id = ? AND reporter_contact IS NOT NULL "
            "AND sms_opt_in = 1", (issue_id,)):
        body = (f"GalliGraph: Your complaint {c['tracking_code']} ({label}) has been resolved. "
                f"Not fixed? Tell us: {public_base_url()}/#track/{c['tracking_code']}")
        rows.append({"complaint_id": c["id"], "issue_id": issue_id, "to": c["reporter_contact"], "body": body})
    if rows:
        threading.Thread(target=_deliver, args=(rows,), daemon=True).start()
    return len(rows)
