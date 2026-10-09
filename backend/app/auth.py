"""Official accounts, sessions and rate limits.

* Passwords: scrypt with a per-user random salt (Python standard library, no extra dependency).
* Sessions: an HMAC-signed token in an httpOnly, SameSite=Lax cookie. No server-side session store.
* Roles: "official" (work on issues) and "supervisor" (also accept/reject flagged closures, close manually).
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from . import config, db
from .timeutil import iso, utcnow

log = logging.getLogger(__name__)

COOKIE = "cp_session"
SESSION_HOURS = 12
ROLES = ("official", "supervisor")

USERS_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'official',
    display_name  TEXT NOT NULL,
    department    TEXT,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);
"""

_secret: bytes | None = None


def _key() -> bytes:
    global _secret
    if _secret is None:
        env = os.getenv("CIVICPULSE_SECRET_KEY")
        if env:
            _secret = env.encode()
        else:
            _secret = secrets.token_bytes(32)
            log.warning("CIVICPULSE_SECRET_KEY not set: using a random key, so logins reset when the server restarts")
    return _secret


# ----------------------------------------------------------------------------- passwords

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), n=2 ** 14, r=8, p=1)
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


# ----------------------------------------------------------------------------- users

def init_users(conn: sqlite3.Connection) -> None:
    conn.executescript(USERS_SCHEMA)
    # Bootstrap the first supervisor account from the environment (never hard-coded).
    username = os.getenv("CIVICPULSE_ADMIN_USER", "admin")
    password = os.getenv("CIVICPULSE_ADMIN_PASSWORD")
    if password and not conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        create_user(conn, username, password, "supervisor", "Municipal Supervisor")
        log.info("created supervisor account '%s' from CIVICPULSE_ADMIN_PASSWORD", username)
    if not conn.execute("SELECT 1 FROM users").fetchone():
        log.warning("no official accounts exist: set CIVICPULSE_ADMIN_PASSWORD or run scripts/create_user.py")


def create_user(conn: sqlite3.Connection, username: str, password: str, role: str, display_name: str,
                department: str | None = None) -> None:
    if role not in ROLES:
        raise ValueError(f"role must be one of {ROLES}")
    if len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    conn.execute(
        "INSERT INTO users (username, password_hash, role, display_name, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (username.strip().lower(), hash_password(password), role, display_name, department, iso(utcnow())))


def authenticate(username: str, password: str) -> dict | None:
    with db.session() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            return None
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (iso(utcnow()), row["id"]))
        return public_user(row)


def public_user(row) -> dict:
    return {"id": row["id"], "username": row["username"], "role": row["role"],
            "display_name": row["display_name"], "department": row["department"]}


# ----------------------------------------------------------------------------- sessions

def make_token(user: dict) -> str:
    payload = base64.urlsafe_b64encode(json.dumps(
        {"uid": user["id"], "exp": int(time.time()) + SESSION_HOURS * 3600}).encode()).decode()
    sig = hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def read_token(token: str | None) -> int | None:
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    expected = hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
    except (ValueError, json.JSONDecodeError):
        return None
    return data["uid"] if data.get("exp", 0) > time.time() else None


def current_user(request: Request) -> dict | None:
    uid = read_token(request.cookies.get(COOKIE))
    if uid is None:
        return None
    with db.session() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return public_user(row) if row else None


def require_official(request: Request) -> dict:
    user = current_user(request)
    if user is None:
        raise HTTPException(401, "login required")
    return user


def require_supervisor(request: Request) -> dict:
    user = require_official(request)
    if user["role"] != "supervisor":
        raise HTTPException(403, "supervisor role required")
    return user


def cookie_secure(request: Request) -> bool:
    if os.getenv("CIVICPULSE_COOKIE_SECURE") is not None:
        return os.getenv("CIVICPULSE_COOKIE_SECURE") == "1"
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


# ----------------------------------------------------------------------------- rate limiting

class RateLimiter:
    """In-memory sliding window per client IP. Good enough for one server process."""

    def __init__(self, limit: int, window_s: int):
        self.limit, self.window = limit, window_s
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, request: Request) -> None:
        ip = client_ip(request)
        now = time.monotonic()
        with self.lock:
            q = self.hits[ip]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                raise HTTPException(429, f"Too many requests. Please try again in a few minutes.")
            q.append(now)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd and config.TRUST_PROXY:
        # Proxies append the address they saw, so the last entry is the one a client cannot forge.
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


complaint_limiter = RateLimiter(limit=int(os.getenv("CIVICPULSE_COMPLAINTS_PER_10MIN", 10)), window_s=600)
login_limiter = RateLimiter(limit=8, window_s=300)
