"""Voice notes -> text, so citizens who can't type (or prefer to speak Hindi) can still report.

Engines (CIVICPULSE_TRANSCRIBER):
  * "local" - faster-whisper on this machine: free, offline, nothing leaves the server.
              Model size via CIVICPULSE_WHISPER_MODEL (default "small"; "base" is faster but weak on Hindi).
  * "api"   - any OpenAI-compatible /audio/transcriptions endpoint (e.g. Groq's free whisper-large-v3):
              CIVICPULSE_WHISPER_API_URL, CIVICPULSE_WHISPER_API_KEY, CIVICPULSE_WHISPER_API_MODEL.
  * "auto"  - local if faster-whisper is installed, else api if a key is set, else voice notes are unavailable.
  * "none"  - off.

Hindi speech is returned as spoken (often Devanagari) plus an English translation, because the trained
classifier and keyword engine are strongest on English/Hinglish text.
"""
import base64
import logging
import os
import tempfile
import threading
import time
from dataclasses import dataclass

import httpx

log = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 8 * 1024 * 1024  # ~2-3 min of compressed speech
AUDIO_TYPES = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
               "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/amr": "amr", "video/mp4": "mp4",
               "video/webm": "webm"}


class TranscribeError(ValueError):
    pass


@dataclass
class Transcript:
    text: str            # what the citizen said, in their language
    language: str        # ISO code detected by Whisper, e.g. "hi", "en"
    english: str | None  # English translation when the speech was not English
    seconds: float       # processing time
    engine: str

    def for_ai(self) -> str:
        """Text handed to the triage pipeline: the original words plus the English meaning when they differ."""
        if self.english and self.english.strip().lower() != self.text.strip().lower():
            return f"{self.text}\n(English: {self.english})"
        return self.text


_model = None
_model_lock = threading.Lock()


def _local_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def engine() -> str:
    choice = os.getenv("CIVICPULSE_TRANSCRIBER", "auto").lower()
    if choice == "auto":
        if _local_available():
            return "local"
        return "api" if os.getenv("CIVICPULSE_WHISPER_API_KEY") else "none"
    return choice


def available() -> bool:
    return engine() in ("local", "api")


def _local_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel
            name = os.getenv("CIVICPULSE_WHISPER_MODEL", "small")
            log.info("loading Whisper model '%s' (first use downloads it)", name)
            _model = WhisperModel(name, device="cpu", compute_type="int8")
        return _model


def _run_local(path: str) -> Transcript:
    t0 = time.perf_counter()
    model = _local_model()
    segments, info = model.transcribe(path, beam_size=1, vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    english = None
    if text and info.language != "en":
        segments, _ = model.transcribe(path, beam_size=1, task="translate", language=info.language)
        english = " ".join(s.text.strip() for s in segments).strip() or None
    return Transcript(text, info.language, english, round(time.perf_counter() - t0, 2), "local-whisper")


def _run_api(data: bytes, ext: str) -> Transcript:
    url = os.getenv("CIVICPULSE_WHISPER_API_URL", "https://api.groq.com/openai/v1/audio/transcriptions")
    key = os.getenv("CIVICPULSE_WHISPER_API_KEY")
    model = os.getenv("CIVICPULSE_WHISPER_API_MODEL", "whisper-large-v3")
    if not key:
        raise TranscribeError("Voice transcription API key is not configured")
    t0 = time.perf_counter()
    headers = {"Authorization": f"Bearer {key}"}

    def call(endpoint: str) -> dict:
        resp = httpx.post(endpoint, headers=headers, timeout=60,
                          files={"file": (f"voice.{ext}", data)},
                          data={"model": model, "response_format": "verbose_json"})
        if resp.status_code >= 300:
            raise TranscribeError(f"Transcription service error {resp.status_code}")
        return resp.json()

    out = call(url)
    text, lang = (out.get("text") or "").strip(), (out.get("language") or "").lower()
    lang = {"hindi": "hi", "english": "en"}.get(lang, lang[:2] or "und")
    english = None
    if text and lang != "en" and url.endswith("/transcriptions"):
        try:
            english = (call(url.replace("/transcriptions", "/translations")).get("text") or "").strip() or None
        except TranscribeError:
            english = None
    return Transcript(text, lang, english, round(time.perf_counter() - t0, 2), f"api:{model}")


def transcribe(data: bytes, media_type: str | None) -> Transcript:
    """Raises TranscribeError for unusable input or when no engine is configured."""
    if not data:
        raise TranscribeError("The voice note is empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise TranscribeError("Voice note is too long (max ~2 minutes)")
    ext = AUDIO_TYPES.get((media_type or "").split(";")[0].strip().lower())
    if not ext:
        raise TranscribeError("Unsupported audio format")
    eng = engine()
    if eng == "local":
        with tempfile.NamedTemporaryFile(suffix=f".{ext}") as f:
            f.write(data)
            f.flush()
            try:
                t = _run_local(f.name)
            except Exception as exc:  # corrupt or undecodable audio
                log.warning("local transcription failed: %s", exc)
                raise TranscribeError("Could not understand the audio file") from exc
    elif eng == "api":
        t = _run_api(data, ext)
    else:
        raise TranscribeError("Voice notes are not enabled on this server")
    if len(t.text) < 3:
        raise TranscribeError("Couldn't hear any words. Please try again closer to the microphone.")
    return t


def transcribe_b64(b64: str, media_type: str | None) -> Transcript:
    try:
        data = base64.b64decode(b64, validate=True)
    except (ValueError, TypeError) as exc:
        raise TranscribeError("Invalid audio data") from exc
    return transcribe(data, media_type)
