"""Download sensitive points of interest (schools, hospitals, clinics, colleges) for Jaipur from
OpenStreetMap via the Overpass API -> data/pois.json. Used by the priority score's population factor.

Usage: python scripts/fetch_pois.py
"""
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
BBOX = (26.74, 75.66, 27.03, 75.93)  # south, west, north, east around Jaipur
TYPES = ["school", "hospital", "clinic", "college", "kindergarten"]

QUERY = f"""
[out:json][timeout:90];
(
  {''.join(f'nwr["amenity"="{t}"]{BBOX};' for t in TYPES)}
);
out center tags;
"""


def main() -> None:
    resp = httpx.post("https://overpass-api.de/api/interpreter", data={"data": QUERY}, timeout=120,
                      headers={"User-Agent": "CivicPulse/0.1 (hackathon prototype)"})
    resp.raise_for_status()
    out = []
    for el in resp.json()["elements"]:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lng = el.get("lon") or el.get("center", {}).get("lon")
        tags = el.get("tags", {})
        if lat is None or lng is None:
            continue
        out.append({"type": tags.get("amenity"), "name": tags.get("name") or tags.get("amenity", "").title(),
                    "lat": round(lat, 6), "lng": round(lng, 6), "osm_id": f"{el['type']}/{el['id']}"})
    path = ROOT / "data" / "pois.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    counts = {t: sum(p["type"] == t for p in out) for t in TYPES}
    print(f"saved {len(out)} POIs -> {path}  {counts}")


if __name__ == "__main__":
    main()
