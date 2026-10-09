"""SQLite storage. A Complaint is one citizen report; an Issue is the real-world problem
that one or more complaints describe."""
import json
import sqlite3
from contextlib import contextmanager

import numpy as np

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS issues (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    category           TEXT NOT NULL,
    sub_type           TEXT NOT NULL,
    summary            TEXT NOT NULL,
    lat                REAL,
    lng                REAL,
    locality_id        TEXT,
    geo_precision      TEXT,
    location_detail    TEXT,
    spot_keys          TEXT,
    severity           INTEGER NOT NULL,
    safety_risk        INTEGER NOT NULL DEFAULT 0,
    reported_duration_days INTEGER,
    report_count       INTEGER NOT NULL DEFAULT 1,
    priority_score     REAL NOT NULL DEFAULT 0,
    priority_breakdown TEXT,
    department         TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'open',
    first_reported     TEXT NOT NULL,
    last_reported      TEXT NOT NULL,
    resolved_at        TEXT,
    embedding          BLOB,
    secondary_department TEXT,
    sla_hours          REAL,
    sla_due_at         TEXT,
    sla_tier           TEXT,
    escalation_level   INTEGER NOT NULL DEFAULT 0,
    assigned_officer   TEXT,
    resolution_note    TEXT,
    after_image        TEXT,
    verification       TEXT
);
CREATE TABLE IF NOT EXISTS complaints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text        TEXT NOT NULL,
    channel         TEXT NOT NULL DEFAULT 'web',
    has_image       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    extracted       TEXT NOT NULL,
    extractor       TEXT NOT NULL,
    category        TEXT NOT NULL,
    lat             REAL,
    lng             REAL,
    locality_id     TEXT,
    geo_precision   TEXT,
    embedding       BLOB,
    issue_id        INTEGER REFERENCES issues(id),
    dedup_score     REAL,
    needs_review    INTEGER NOT NULL DEFAULT 0,
    processing_ms   INTEGER,
    reporter_contact TEXT,
    image_path      TEXT
);
CREATE TABLE IF NOT EXISTS issue_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id  INTEGER NOT NULL REFERENCES issues(id),
    at        TEXT NOT NULL,
    kind      TEXT NOT NULL,
    message   TEXT NOT NULL,
    actor     TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS issue_tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id     INTEGER NOT NULL REFERENCES issues(id),
    department   TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'primary',
    status       TEXT NOT NULL DEFAULT 'open',
    created_at   TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (issue_id, department)
);
CREATE INDEX IF NOT EXISTS idx_issues_cat ON issues(category, status);
CREATE INDEX IF NOT EXISTS idx_complaints_issue ON complaints(issue_id);
CREATE INDEX IF NOT EXISTS idx_complaints_time ON complaints(created_at);
CREATE INDEX IF NOT EXISTS idx_events_issue ON issue_events(issue_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# Columns added after the first release; older databases get them via ALTER TABLE.
_MIGRATIONS = {
    "issues": {
        "secondary_department": "TEXT", "sla_hours": "REAL", "sla_due_at": "TEXT", "sla_tier": "TEXT",
        "escalation_level": "INTEGER NOT NULL DEFAULT 0", "assigned_officer": "TEXT", "resolution_note": "TEXT",
        "after_image": "TEXT", "verification": "TEXT",
    },
    "complaints": {"image_path": "TEXT"},
}


def init() -> None:
    with session() as conn:
        for table, cols in _MIGRATIONS.items():
            if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
                for col, decl in cols.items():
                    if col not in have:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        conn.executescript(SCHEMA)


def reset() -> None:
    with session() as conn:
        conn.executescript("DROP TABLE IF EXISTS issue_events; DROP TABLE IF EXISTS issue_tasks; "
                           "DROP TABLE IF EXISTS complaints; DROP TABLE IF EXISTS issues;")
        conn.executescript(SCHEMA)


def log_event(conn: sqlite3.Connection, issue_id: int, at: str, kind: str, message: str, actor: str = "system") -> None:
    conn.execute("INSERT INTO issue_events (issue_id, at, kind, message, actor) VALUES (?, ?, ?, ?, ?)",
                 (issue_id, at, kind, message, actor))


def to_blob(vec: np.ndarray) -> bytes:
    return vec.astype(np.float32).tobytes()


def from_blob(blob: bytes | None) -> np.ndarray | None:
    return None if blob is None else np.frombuffer(blob, dtype=np.float32)


def issue_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d.pop("embedding", None)
    d["safety_risk"] = bool(d["safety_risk"])
    d["spot_keys"] = json.loads(d["spot_keys"]) if d.get("spot_keys") else []
    d["priority_breakdown"] = json.loads(d["priority_breakdown"]) if d["priority_breakdown"] else None
    d["verification"] = json.loads(d["verification"]) if d.get("verification") else None
    d["after_image_url"] = media_url(d.pop("after_image", None))
    return d


def media_url(path: str | None) -> str | None:
    return f"/api/media/{path}" if path else None


def complaint_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d.pop("embedding", None)
    d.pop("reporter_contact", None)
    d["has_image"] = bool(d["has_image"])
    d["needs_review"] = bool(d["needs_review"])
    d["extracted"] = json.loads(d["extracted"])
    d["image_url"] = media_url(d.pop("image_path", None))
    return d
