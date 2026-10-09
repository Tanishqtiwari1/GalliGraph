"""Minimal client for a local Ollama server (free, offline LLMs)."""
import json
import logging

import httpx
from pydantic import BaseModel, ValidationError

from . import config

log = logging.getLogger(__name__)


class OllamaError(RuntimeError):
    pass


class ModelMissing(OllamaError):
    pass


def chat_json(model: str, system: str, user: str, schema: type[BaseModel], images: list[str] | None = None,
              timeout: float | None = None):
    """Ask a local model for JSON matching `schema`; returns a validated instance.

    `images` are base64 strings (no data: prefix) and need a vision model such as gemma3.
    """
    message: dict = {"role": "user", "content": user}
    if images:
        message["images"] = images
    try:
        resp = httpx.post(
            f"{config.OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": [{"role": "system", "content": system}, message],
                "format": schema.model_json_schema(),  # constrained decoding to the schema
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=timeout or config.OLLAMA_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise OllamaError(f"Ollama not reachable at {config.OLLAMA_URL}: {exc}") from exc
    if resp.status_code == 404:
        raise ModelMissing(f"model '{model}' is not installed; run: ollama pull {model}")
    if resp.status_code != 200:
        raise OllamaError(f"Ollama error {resp.status_code}: {resp.text[:200]}")
    content = resp.json().get("message", {}).get("content", "")
    try:
        return schema.model_validate_json(content)
    except ValidationError as exc:
        raise OllamaError(f"model returned invalid JSON: {content[:200]}") from exc


def available() -> bool:
    try:
        return httpx.get(f"{config.OLLAMA_URL}/api/version", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


def installed_models() -> list[str]:
    try:
        return [m["name"] for m in httpx.get(f"{config.OLLAMA_URL}/api/tags", timeout=3).json().get("models", [])]
    except (httpx.HTTPError, json.JSONDecodeError, KeyError):
        return []
