"""Trained complaint classifier (TF-IDF + logistic regression on real civic complaints).

Produced by scripts/train_classifier.py. Optional: if the model file is missing, CivicPulse
uses keyword rules only.
"""
import logging
from functools import lru_cache

from . import config

log = logging.getLogger(__name__)
MODEL_PATH = config.BACKEND_DIR / "models" / "complaint_classifier.joblib"


@lru_cache
def _load() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    try:
        import joblib
        return joblib.load(MODEL_PATH)
    except Exception as exc:  # corrupt file or incompatible scikit-learn version
        log.warning("could not load classifier (%s); using keyword rules only", exc)
        return None


def available() -> bool:
    return _load() is not None


def predict(text: str) -> tuple[str, float, dict[str, float]] | None:
    """Returns (category, probability, {category: probability}) or None if no model."""
    bundle = _load()
    if bundle is None:
        return None
    model = bundle["category"]
    probs = dict(zip(model.classes_, model.predict_proba([text])[0]))
    best = max(probs, key=probs.get)
    return best, float(probs[best]), probs


def predict_sub_type(text: str, category: str) -> str | None:
    """Most likely sub-type within the given category."""
    bundle = _load()
    if bundle is None:
        return None
    model = bundle["sub_type"]
    probs = zip(model.classes_, model.predict_proba([text])[0])
    within = [(label.split("/", 1)[1], p) for label, p in probs if label.startswith(f"{category}/")]
    return max(within, key=lambda x: x[1])[0] if within else None
