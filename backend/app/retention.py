"""Data minimisation: personal data is kept only as long as it is needed.

* Phone numbers (web SMS opt-in and WhatsApp senders) are only needed for the "resolved" message, so they
  are erased config.CONTACT_RETENTION_DAYS after the issue is closed.
* Unsent WhatsApp drafts (phone number, text, photo) are erased after a day.
* Optionally (config.PHOTO_RETENTION_DAYS > 0) evidence photos of long-closed issues are deleted.

Runs at startup and then once an hour in a background thread.
"""
import logging
import threading
from datetime import timedelta

from . import config, db
from .media import delete_image
from .timeutil import iso, utcnow

log = logging.getLogger(__name__)
CLOSED = "('resolved', 'rejected')"


def purge() -> dict:
    now = utcnow()
    out = {}
    with db.session() as conn:
        cutoff = iso(now - timedelta(days=config.CONTACT_RETENTION_DAYS))
        out["contacts_erased"] = conn.execute(
            "UPDATE complaints SET reporter_contact = NULL, sms_opt_in = 0 WHERE reporter_contact IS NOT NULL AND "
            f"issue_id IN (SELECT id FROM issues WHERE status IN {CLOSED} AND resolved_at < ?)", (cutoff,)).rowcount
        out["whatsapp_drafts_erased"] = conn.execute(
            "DELETE FROM whatsapp_sessions WHERE updated_at < ?", (iso(now - timedelta(days=1)),)).rowcount

        if config.PHOTO_RETENTION_DAYS > 0:
            cutoff = iso(now - timedelta(days=config.PHOTO_RETENTION_DAYS))
            old = f"SELECT id FROM issues WHERE status IN {CLOSED} AND resolved_at < ?"
            photos = [r[0] for r in conn.execute(
                f"SELECT image_path FROM complaints WHERE image_path IS NOT NULL AND issue_id IN ({old})", (cutoff,))]
            photos += [r[0] for r in conn.execute(
                f"SELECT after_image FROM issues WHERE after_image IS NOT NULL AND id IN ({old})", (cutoff,))]
            conn.execute(f"UPDATE complaints SET image_path = NULL WHERE issue_id IN ({old})", (cutoff,))
            conn.execute(f"UPDATE issues SET after_image = NULL WHERE id IN ({old})", (cutoff,))
            for name in photos:
                delete_image(name)
            out["photos_deleted"] = len(photos)
    if any(out.values()):
        log.info("retention: %s", out)
    return out


def start_background(interval_s: int = 3600) -> None:
    stop = threading.Event()

    def loop():
        while not stop.wait(interval_s):
            try:
                purge()
            except Exception:
                log.exception("retention purge failed")
    threading.Thread(target=loop, name="retention", daemon=True).start()
