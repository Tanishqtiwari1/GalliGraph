"""Text embeddings for duplicate detection.

Uses a multilingual sentence-transformer when installed (`pip install sentence-transformers`),
otherwise a dependency-free hashed character n-gram embedding that is robust to typos and
spelling variants ("gaddha" / "gadha", "Raja Park" / "rajapark").
"""
import os
import re
import zlib
from functools import lru_cache

import numpy as np

HASH_DIM = 2048
ST_MODEL = os.getenv("CIVICPULSE_ST_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")


@lru_cache
def _st_model():
    if os.getenv("CIVICPULSE_EMBEDDINGS", "auto") == "hash":
        return None
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        return None
    return SentenceTransformer(ST_MODEL)


def backend_name() -> str:
    return f"sentence-transformers:{ST_MODEL}" if _st_model() else "hashed-char-ngrams"


def _hash_embed(text: str) -> np.ndarray:
    text = re.sub(r"[^\w\sऀ-ॿ]", " ", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    vec = np.zeros(HASH_DIM, dtype=np.float32)
    words = text.split()
    feats = [f"w:{w}" for w in words] + [f"b:{a}_{b}" for a, b in zip(words, words[1:])]
    padded = f" {text} "
    feats += [f"c:{padded[i:i + n]}" for n in (3, 4) for i in range(len(padded) - n + 1)]
    for f in feats:
        h = zlib.crc32(f.encode())
        vec[h % HASH_DIM] += 1.0 if (h >> 31) & 1 else -1.0
    vec = np.sign(vec) * np.log1p(np.abs(vec))
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec


def embed(text: str) -> np.ndarray:
    model = _st_model()
    if model is not None:
        return model.encode(text, normalize_embeddings=True).astype(np.float32)
    return _hash_embed(text)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        return 0.0
    return float(np.clip(np.dot(a, b), -1.0, 1.0))
