"""Geocoding, locality (zone) lookup and nearby points of interest."""
import json
import math
import re
from dataclasses import dataclass
from functools import lru_cache

import httpx

from . import config
from .fuzzy import phrase_in, tokens


@dataclass
class GeoResult:
    lat: float | None
    lng: float | None
    locality_id: str | None
    precision: str  # "gps" | "landmark" | "locality" | "unknown"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@lru_cache
def localities() -> list[dict]:
    with open(config.DATA_DIR / "jaipur_localities.json", encoding="utf-8") as f:
        return json.load(f)["localities"]


@lru_cache
def locality_by_id() -> dict[str, dict]:
    return {loc["id"]: loc for loc in localities()}


@lru_cache
def pois() -> list[dict]:
    """Schools, hospitals etc. from OpenStreetMap (scripts/fetch_pois.py). Optional."""
    path = config.DATA_DIR / "pois.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def match_locality(*texts: str | None) -> str | None:
    """Find a known locality mentioned in free text (typo tolerant; longest alias wins)."""
    toks = tokens(" ".join(t for t in texts if t))
    best, best_len = None, 0
    for loc in localities():
        for alias in loc["aliases"]:
            if len(alias) > best_len and phrase_in(alias, toks):
                best, best_len = loc["id"], len(alias)
    return best


def nearest_locality(lat: float, lng: float) -> str:
    return min(localities(), key=lambda loc: haversine_m(lat, lng, loc["lat"], loc["lng"]))["id"]


def _nominatim(query: str) -> tuple[float, float] | None:
    try:
        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": f"{query}, {config.CITY}, India", "format": "json", "limit": 1},
            headers={"User-Agent": "CivicPulse/0.1 (hackathon prototype)"},
            timeout=5,
        )
        resp.raise_for_status()
        hits = resp.json()
        if hits:
            return float(hits[0]["lat"]), float(hits[0]["lon"])
    except httpx.HTTPError:
        pass
    return None


def geocode(location_text: str | None, raw_text: str, lat: float | None = None, lng: float | None = None) -> GeoResult:
    # 1. Device GPS is the most precise signal.
    if lat is not None and lng is not None:
        return GeoResult(lat, lng, nearest_locality(lat, lng), "gps")

    # 2. Landmark lookup via OpenStreetMap, if enabled.
    if config.USE_NOMINATIM and location_text:
        hit = _nominatim(location_text)
        if hit and haversine_m(*hit, 26.9124, 75.7873) < 30_000:  # stay inside the city
            return GeoResult(hit[0], hit[1], nearest_locality(*hit), "landmark")

    # 3. Offline gazetteer: locality centroid.
    loc_id = match_locality(location_text, raw_text)
    if loc_id:
        loc = locality_by_id()[loc_id]
        return GeoResult(loc["lat"], loc["lng"], loc_id, "locality")

    return GeoResult(None, None, None, "unknown")


def pois_near(lat: float | None, lng: float | None, radius_m: float = 300) -> list[dict]:
    if lat is None or lng is None:
        return []
    out = []
    for p in pois():
        d = haversine_m(lat, lng, p["lat"], p["lng"])
        if d <= radius_m:
            out.append({**p, "distance_m": round(d)})
    return sorted(out, key=lambda p: p["distance_m"])


# ----------------------------------------------------------------------------- spot fingerprint
# Two complaints in the same locality are only the same issue if they point at the same spot.
_LANE = re.compile(r"(?:gali|galli|gaali|gully|lane|street|stret|st|sector|block|plot|road|गली)\.?\s*(?:no|number|नंबर|num)?\.?\s*[-#]?\s*(\d{1,3})\b",
                   re.IGNORECASE)
LANDMARKS = {
    "shiv_mandir": ["shiv mandir", "shiv temple", "शिव मंदिर"],
    "hanuman_mandir": ["hanuman temple", "hanuman mandir", "हनुमान मंदिर"],
    "gurudwara": ["gurudwara", "गुरुद्वारा"],
    "masjid": ["masjid", "mosque", "मस्जिद"],
    "atm": ["atm"],
    "petrol_pump": ["petrol pump", "पेट्रोल पंप"],
    "govt_school": ["govt school", "government school", "सरकारी स्कूल"],
    "park_gate": ["park gate", "पार्क गेट"],
    "water_tank": ["water tank", "paani ki tanki", "पानी की टंकी"],
    "bus_stop": ["bus stop", "बस स्टॉप"],
    "community_hall": ["community hall", "सामुदायिक भवन"],
    "reliance_fresh": ["reliance fresh"],
}


def spot_keys(*texts: str | None) -> list[str]:
    text = " ".join(t for t in texts if t)
    keys = {f"n:{int(m)}" for m in _LANE.findall(text)}
    toks = tokens(text)
    keys |= {f"lm:{k}" for k, phrases in LANDMARKS.items() if any(phrase_in(p, toks) for p in phrases)}
    return sorted(keys)


def spot_relation(a: list[str], b: list[str]) -> str:
    """'same' (share a key), 'different' (both specific, nothing shared) or 'unknown'."""
    if not a or not b:
        return "unknown"
    return "same" if set(a) & set(b) else "different"
