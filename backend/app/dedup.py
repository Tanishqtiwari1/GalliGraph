"""Stage 4: decide whether a new complaint describes an issue we already know about.

score = 0.5 * text_similarity + 0.3 * geo_similarity + 0.2 * time_similarity
  >= MERGE threshold  -> attach to the existing issue
  >= REVIEW threshold -> attach, but flag for a human to confirm
  otherwise           -> new issue
"""
import sqlite3
from dataclasses import dataclass, field
from datetime import timedelta

import numpy as np

from . import config
from .db import from_blob
from .embed import cosine
import json

from .geo import haversine_m, spot_relation
from .timeutil import days_between, iso, parse

PRECISE = {"gps", "landmark"}


@dataclass
class Candidate:
    issue_id: int
    score: float
    text: float
    geo: float
    time: float
    distance_m: float | None


@dataclass
class DedupResult:
    issue_id: int | None
    score: float | None
    needs_review: bool
    candidates: list[Candidate] = field(default_factory=list)


def _geo_similarity(c_lat, c_lng, c_prec, c_loc, i_lat, i_lng, i_prec, i_loc, spot: str) -> tuple[float | None, float | None]:
    """Returns (similarity, distance_m); similarity None means 'cannot be the same place'."""
    both_precise = c_prec in PRECISE and i_prec in PRECISE and c_lat is not None and i_lat is not None
    if spot == "different" and not (both_precise and haversine_m(c_lat, c_lng, i_lat, i_lng) <= 100):
        return None, None  # e.g. "gali 5" vs "gali 12": different spots even in the same locality
    if c_lat is None or i_lat is None:
        return (0.8 if spot == "same" else 0.3), None  # location unknown on one side
    d = haversine_m(c_lat, c_lng, i_lat, i_lng)
    if c_prec in PRECISE and i_prec in PRECISE:
        if d > config.DEDUP_RADIUS_M:
            return None, d
        return max(1 - d / config.DEDUP_RADIUS_M, 0.9 if spot == "same" else 0.0), d
    # At least one side is only known to locality level.
    if c_loc and c_loc == i_loc:
        return (1.0 if spot == "same" else 0.6), d
    return None, d


def find_match(conn: sqlite3.Connection, *, category: str, lat, lng, precision: str, locality_id,
               created_at: str, embedding: np.ndarray, spot_keys: list[str]) -> DedupResult:
    window_start = iso(parse(created_at) - timedelta(days=config.DEDUP_WINDOW_DAYS))
    rows = conn.execute(
        """SELECT id, lat, lng, geo_precision, locality_id, last_reported, embedding, spot_keys FROM issues
           WHERE category = ? AND status != 'resolved' AND last_reported >= ?""",
        (category, window_start),
    ).fetchall()

    w = config.DEDUP_WEIGHTS
    cands: list[Candidate] = []
    for r in rows:
        spot = spot_relation(spot_keys, json.loads(r["spot_keys"] or "[]"))
        geo, dist = _geo_similarity(lat, lng, precision, locality_id,
                                    r["lat"], r["lng"], r["geo_precision"], r["locality_id"], spot)
        if geo is None:
            continue
        text = max(0.0, cosine(embedding, from_blob(r["embedding"])))
        time = max(0.0, 1 - days_between(created_at, r["last_reported"]) / config.DEDUP_WINDOW_DAYS)
        score = w["text"] * text + w["geo"] * geo + w["time"] * time
        cands.append(Candidate(r["id"], round(score, 4), round(text, 4), round(geo, 4), round(time, 4),
                               None if dist is None else round(dist)))

    cands.sort(key=lambda c: c.score, reverse=True)
    best = cands[0] if cands else None
    if best and best.score >= config.DEDUP_MERGE_THRESHOLD:
        return DedupResult(best.issue_id, best.score, False, cands[:5])
    if best and best.score >= config.DEDUP_REVIEW_THRESHOLD:
        return DedupResult(best.issue_id, best.score, True, cands[:5])
    return DedupResult(None, best.score if best else None, False, cands[:5])


def merged_embedding(old: np.ndarray, n_old: int, new: np.ndarray) -> np.ndarray:
    """Running mean of member embeddings, re-normalised."""
    if old is None or old.shape != new.shape:
        return new
    v = (old * n_old + new) / (n_old + 1)
    norm = np.linalg.norm(v)
    return v / norm if norm else v
