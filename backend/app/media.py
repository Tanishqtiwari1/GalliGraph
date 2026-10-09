"""Evidence photo storage (complaint photos and after-repair photos)."""
import base64
import binascii
import uuid

from . import config

UPLOAD_DIR = config.UPLOAD_DIR
MAX_BYTES = 5 * 1024 * 1024
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


class MediaError(ValueError):
    pass


def save_image(b64: str, media_type: str | None) -> str:
    """Validate and store a base64 image; returns the stored file name."""
    media_type = media_type or "image/jpeg"
    if media_type not in EXT:
        raise MediaError(f"unsupported image type {media_type}")
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise MediaError("image is not valid base64") from exc
    if len(data) > MAX_BYTES:
        raise MediaError("image larger than 5 MB")
    UPLOAD_DIR.mkdir(exist_ok=True)
    name = f"{uuid.uuid4().hex}.{EXT[media_type]}"
    (UPLOAD_DIR / name).write_bytes(data)
    return name


def load_image(name: str) -> tuple[str, str] | None:
    """Returns (base64, media_type) for a stored image, or None if missing."""
    path = UPLOAD_DIR / name
    if not path.is_file():
        return None
    media_type = next((t for t, e in EXT.items() if name.endswith(f".{e}")), "image/jpeg")
    return base64.standard_b64encode(path.read_bytes()).decode(), media_type
