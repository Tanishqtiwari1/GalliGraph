"""Evidence photo storage (complaint photos and after-repair photos).

Every photo is decoded and re-encoded before it is stored or sent to an AI model. That proves it really
is an image (not a script renamed .jpg) and drops EXIF metadata, which on phone photos includes the exact
GPS position of the citizen's home and the phone model.
"""
import base64
import binascii
import io
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

from . import config

UPLOAD_DIR = config.UPLOAD_DIR
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000  # decompression-bomb guard
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class MediaError(ValueError):
    pass


def clean_image(b64: str, media_type: str | None) -> tuple[str, str]:
    """Validate a base64 image and re-encode it without metadata. Returns (base64, media_type)."""
    media_type = media_type or "image/jpeg"
    if media_type not in EXT:
        raise MediaError(f"unsupported image type {media_type}")
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise MediaError("image is not valid base64") from exc
    if len(data) > MAX_BYTES:
        raise MediaError("image larger than 5 MB")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.seek(0)  # animated GIF/WebP: keep the first frame only
            img = ImageOps.exif_transpose(img)  # keep the visual orientation once EXIF is gone
            img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError) as exc:
        raise MediaError("file is not a readable image") from exc
    if media_type == "image/gif":
        media_type = "image/png"
    fmt = _FORMAT[media_type]
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif fmt == "PNG" and img.mode not in ("RGB", "RGBA", "L", "LA", "P"):
        img = img.convert("RGBA")
    out = io.BytesIO()
    img.save(out, fmt, **({"quality": 88} if fmt in ("JPEG", "WEBP") else {}))  # no exif= -> metadata dropped
    return base64.standard_b64encode(out.getvalue()).decode(), media_type


def save_image(b64: str, media_type: str | None) -> str:
    """Validate, strip metadata and store a base64 image; returns the stored file name."""
    return store_image(*clean_image(b64, media_type))


def store_image(b64: str, media_type: str) -> str:
    """Store an image that has already been through clean_image()."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{EXT[media_type]}"
    (UPLOAD_DIR / name).write_bytes(base64.b64decode(b64))
    return name


def delete_image(name: str | None) -> None:
    if name:
        (UPLOAD_DIR / name).unlink(missing_ok=True)


def load_image(name: str) -> tuple[str, str] | None:
    """Returns (base64, media_type) for a stored image, or None if missing."""
    path = UPLOAD_DIR / name
    if not path.is_file():
        return None
    media_type = next((t for t, e in EXT.items() if name.endswith(f".{e}")), "image/jpeg")
    return base64.standard_b64encode(path.read_bytes()).decode(), media_type
