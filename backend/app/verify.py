"""AI-assisted resolution verification.

When an officer closes an issue they upload an after-repair photo. Claude compares it with the
citizens' original photos (if any) and the issue description. The verdict is evidence for a human,
not proof: anything other than a confident "resolved" keeps the issue open for review.
"""
import logging
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from . import config
from .extract import claude_available
from .media import load_image

log = logging.getLogger(__name__)


class Verdict(BaseModel):
    verdict: Literal["resolved", "not_resolved", "unclear"]
    confidence: Literal["high", "medium", "low"]
    same_location_likely: bool | None = Field(
        description="Whether the after photo appears to show the same place as the before photos; null if no before photo")
    explanation: str = Field(description="One or two sentences an official can read")


SYSTEM = """You verify civic repair work for a municipal corporation in India.
You get a description of a reported problem, optionally the citizens' original photos (BEFORE),
and the field officer's photo taken after the repair (AFTER).
Decide whether the AFTER photo shows the specific problem fixed.
- "resolved": the problem is clearly fixed in the AFTER photo.
- "not_resolved": the problem is still visible, or the photo shows something unrelated.
- "unclear": the photo is too dark, blurry, cropped or generic to tell.
Be sceptical: a stock-looking photo, a different street, or a photo that does not show the problem area
should not count as resolved. If BEFORE photos exist, check whether AFTER looks like the same place."""


def _skipped(reason: str) -> dict:
    return {"verdict": "unclear", "confidence": "low", "same_location_likely": None,
            "explanation": reason, "method": "none", "auto_accept": False}


def verify_resolution(summary: str, before_images: list[str], after_image: str | None) -> dict:
    """Returns the verdict plus `auto_accept`: whether the closure can be accepted without a supervisor."""
    if not after_image:
        return _skipped("No after-repair photo was provided, so the closure cannot be verified. Needs human review.")
    method = active_verifier()
    if method == "ollama":
        return _verify_ollama(summary, before_images, after_image)
    if method == "claude":
        return _verify_claude(summary, before_images, after_image)
    return _skipped("AI photo verification is not configured. A supervisor should review the photo.")


def active_verifier() -> str:
    from . import ollama

    choice = config.VERIFIER
    if choice == "auto":
        if config.EXTRACTOR == "ollama":
            return "ollama"
        if config.EXTRACTOR != "rules" and claude_available():
            return "claude"
        return "ollama" if ollama.available() else "none"
    if choice == "claude" and not claude_available():
        return "none"
    return choice


def _verify_ollama(summary: str, before_images: list[str], after_image: str) -> dict:
    from .ollama import ModelMissing, OllamaError, chat_json

    befores = [img for img in (load_image(n) for n in before_images[:2]) if img]
    after = load_image(after_image)
    if after is None:
        return _skipped("After-repair photo could not be read.")
    images = [b64 for b64, _ in befores] + [after[0]]
    order = (f"Images 1-{len(befores)} are BEFORE photos from citizens. The last image is the AFTER photo."
             if befores else "The only image is the AFTER photo; there are no BEFORE photos.")
    try:
        v = chat_json(config.OLLAMA_VISION_MODEL, SYSTEM, f"Reported problem: {summary}\n{order}\nGive your verdict as JSON.",
                      Verdict, images)
    except ModelMissing as exc:
        return _skipped(f"Local vision model missing ({exc}). A supervisor should review the photo.")
    except OllamaError as exc:
        log.warning("local verification failed: %s", exc)
        return _skipped("Local AI verification failed to run. A supervisor should review the photo.")
    # A small local model is less reliable than Claude: only auto-accept when it is highly confident.
    auto = v.verdict == "resolved" and v.confidence == "high"
    return {**v.model_dump(), "method": "ollama", "before_photos": len(befores), "auto_accept": auto}


def _verify_claude(summary: str, before_images: list[str], after_image: str) -> dict:
    content: list[dict] = [{"type": "text", "text": f"Reported problem: {summary}"}]
    befores = [img for img in (load_image(n) for n in before_images[:3]) if img]
    for i, (b64, mt) in enumerate(befores, 1):
        content += [{"type": "text", "text": f"BEFORE photo {i} (from a citizen):"},
                    {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}}]
    after = load_image(after_image)
    if after is None:
        return _skipped("After-repair photo could not be read.")
    content += [{"type": "text", "text": "AFTER photo (from the field officer):"},
                {"type": "image", "source": {"type": "base64", "media_type": after[1], "data": after[0]}},
                {"type": "text", "text": "Give your verdict."}]

    try:
        response = anthropic.Anthropic().messages.parse(
            model=config.LLM_MODEL,
            max_tokens=1024,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_format=Verdict,
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
        log.warning("verification call failed: %s", exc)
        return _skipped("AI verification failed to run. A supervisor should review the photo.")
    if response.stop_reason == "refusal" or response.parsed_output is None:
        return _skipped("AI verification returned no verdict. A supervisor should review the photo.")
    v = response.parsed_output
    return {**v.model_dump(), "method": "claude", "before_photos": len(befores),
            "auto_accept": v.verdict == "resolved" and v.confidence != "low"}
