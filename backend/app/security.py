"""HTTP hardening shared by every response: security headers, a request size cap and a cross-site check.

* Headers: a Content-Security-Policy for the website, no framing (clickjacking), no MIME sniffing,
  no referrer leaking tracking codes to other sites, and HSTS in production.
* Size cap: requests larger than config.MAX_BODY_BYTES are refused before they are read into memory.
* Cross-site check: a state-changing API call must come from this site (or a configured CORS origin).
  The SameSite=Strict session cookie already blocks most CSRF; this also covers the public endpoints.
"""
import base64
import hashlib
import re
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import config

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Called by Twilio's servers (no Origin header, verified by signature instead)
CROSS_SITE_OK = {"/api/whatsapp/webhook"}


def _inline_script_hashes() -> list[str]:
    """CSP hashes for the inline <script> blocks in the built index.html (e.g. the dark-mode boot script)."""
    index = config.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return []
    html = index.read_text(encoding="utf-8")
    return [f"'sha256-{base64.b64encode(hashlib.sha256(m.encode()).digest()).decode()}'"
            for m in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)]


def content_security_policy() -> str:
    return "; ".join([
        "default-src 'self'",
        "script-src 'self' " + " ".join(_inline_script_hashes()),
        # React style={{}} props and Leaflet position elements with inline styles
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ] + (["upgrade-insecure-requests"] if config.PRODUCTION else []))


def _same_site(request: Request) -> bool:
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return True  # not a browser cross-site request (curl, server-to-server); cookies are still required for officials
    if origin.rstrip("/") in config.CORS_ORIGINS:
        return True
    host = request.headers.get("x-forwarded-host") if config.TRUST_PROXY else None
    return urlsplit(origin).netloc == (host or request.headers.get("host"))


class BodySizeLimit:
    """ASGI middleware: refuse bodies over the limit, whether or not Content-Length is sent."""

    def __init__(self, app, max_bytes: int):
        self.app, self.max = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = dict(scope["headers"]).get(b"content-length")
        if length and length.isdigit() and int(length) > self.max:
            return await _too_large(send)
        seen = 0

        async def limited_receive():
            nonlocal seen
            message = await receive()
            seen += len(message.get("body", b""))
            if seen > self.max:
                raise _TooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _TooLarge:
            await _too_large(send)


class _TooLarge(Exception):
    pass


async def _too_large(send):
    body = b'{"detail":"Request is too large"}'
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


def install(app: FastAPI) -> None:
    csp = content_security_policy()
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        # Camera/microphone/location are used by the report form on this site only
        "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), "
                              "interest-cohort=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
    }
    if config.PRODUCTION:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    @app.middleware("http")
    async def harden(request: Request, call_next):
        path = request.url.path
        if request.method in UNSAFE and path.startswith("/api/") and path not in CROSS_SITE_OK and not _same_site(request):
            return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
        response = await call_next(request)
        for k, v in headers.items():
            response.headers.setdefault(k, v)
        if path.startswith("/api/"):
            # API answers can hold personal data (officials' views, tracking pages): never cache them in shared caches
            response.headers.setdefault("Cache-Control", "no-store")
        elif not path.startswith(("/docs", "/redoc")):
            response.headers.setdefault("Content-Security-Policy", csp)
        return response

    app.add_middleware(BodySizeLimit, max_bytes=config.MAX_BODY_BYTES)
