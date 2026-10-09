"""Central configuration. Everything is overridable through environment variables (or backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = PROJECT_DIR / "data"

load_dotenv(BACKEND_DIR / ".env")

DB_PATH = Path(os.getenv("CIVICPULSE_DB", BACKEND_DIR / "civicpulse.db"))

# --- LLM extraction ---------------------------------------------------------
# "auto" -> use Claude when credentials exist, otherwise the offline rule-based extractor.
# "claude" -> always Claude. "ollama" -> local models via Ollama. "rules" -> always offline.
# Claude and Ollama fall back to rules if they fail, so the app never stops working.
EXTRACTOR = os.getenv("CIVICPULSE_EXTRACTOR", "auto")
LLM_MODEL = os.getenv("CIVICPULSE_LLM_MODEL", "claude-haiku-4-5")

# "ollama" -> free local models (https://ollama.com); nothing leaves the machine.
OLLAMA_URL = os.getenv("CIVICPULSE_OLLAMA_URL", "http://localhost:11434")
OLLAMA_TEXT_MODEL = os.getenv("CIVICPULSE_OLLAMA_TEXT_MODEL", "qwen2.5:7b")
OLLAMA_VISION_MODEL = os.getenv("CIVICPULSE_OLLAMA_VISION_MODEL", "gemma3:4b")
OLLAMA_TIMEOUT = float(os.getenv("CIVICPULSE_OLLAMA_TIMEOUT", 120))

# Who checks after-repair photos: "auto" | "claude" | "ollama" | "none".
# auto -> Claude if a key is set, else local Ollama if it is running, else a supervisor reviews every closure.
VERIFIER = os.getenv("CIVICPULSE_VERIFIER", "auto")

# --- Geocoding --------------------------------------------------------------
# Nominatim (OpenStreetMap) is used for landmarks not in the local gazetteer. Off by default
# because the public server is rate limited (1 req/s); turn on for live demos.
USE_NOMINATIM = os.getenv("CIVICPULSE_NOMINATIM", "0") == "1"
CITY = os.getenv("CIVICPULSE_CITY", "Jaipur")

# --- Deduplication ----------------------------------------------------------
DEDUP_RADIUS_M = float(os.getenv("DEDUP_RADIUS_M", 300))
DEDUP_WINDOW_DAYS = float(os.getenv("DEDUP_WINDOW_DAYS", 14))
DEDUP_MERGE_THRESHOLD = float(os.getenv("DEDUP_MERGE_THRESHOLD", 0.72))
DEDUP_REVIEW_THRESHOLD = float(os.getenv("DEDUP_REVIEW_THRESHOLD", 0.60))
DEDUP_WEIGHTS = {"text": 0.5, "geo": 0.3, "time": 0.2}

# --- Trends -----------------------------------------------------------------
SPIKE_RECENT_DAYS = int(os.getenv("SPIKE_RECENT_DAYS", 2))
SPIKE_BASELINE_DAYS = int(os.getenv("SPIKE_BASELINE_DAYS", 28))
SPIKE_Z_THRESHOLD = float(os.getenv("SPIKE_Z_THRESHOLD", 3.0))
SPIKE_MIN_COUNT = int(os.getenv("SPIKE_MIN_COUNT", 4))
