"""Evaluate CivicPulse's complaint understanding on REAL complaints it was not trained on
(Bengaluru civic complaints filed in 2022; the classifier was trained on 2019-2021 only).

Also estimates how many real complaints are likely repeats of an open issue, by running the
duplicate detector over the real stream (real GPS + timestamps).

Usage (from backend/):  .venv/bin/python ../scripts/evaluate_real.py [--csv ...] [--dedup-sample 4000]
"""
import argparse
import csv
import json
import os
import sys
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))
os.environ["CIVICPULSE_DB"] = str(Path(tempfile.gettempdir()) / "civicpulse_eval_real.db")
os.environ["CIVICPULSE_EXTRACTOR"] = os.environ.get("CIVICPULSE_EXTRACTOR_EVAL", "rules")
csv.field_size_limit(10_000_000)

from train_classifier import DEFAULT_CSV, clean_text, map_label, parse_date  # noqa: E402

from app import db  # noqa: E402
from app.extract import RuleExtractor  # noqa: E402
from app.pipeline import ingest  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--test-from", default="2022-01-01")
    ap.add_argument("--dedup-sample", type=int, default=4000, help="most recent N complaints for the duplicate study")
    args = ap.parse_args()

    with open(args.csv, encoding="utf-8", errors="replace", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["category_title"] not in ("", "NULL") and parse_date(r["created_at"])]
    split = datetime.fromisoformat(args.test_from)
    test = [r for r in rows if parse_date(r["created_at"]) >= split]

    rx = RuleExtractor()
    y = [map_label(r["category_title"], r["sub_category_title"])[0] for r in test]
    texts = [clean_text(r["title"], r["description"]) for r in test]
    combined = [rx.extract(t).category for t in texts]
    keywords = [rx.extract(t, use_model=False).category for t in texts]
    acc = lambda p: round(sum(a == b for a, b in zip(p, y)) / len(y), 4)
    confusion = Counter((a, b) for a, b in zip(y, combined) if a != b).most_common(6)

    # Duplicate study on the most recent complaints, replayed in time order with their real GPS.
    recent = sorted(rows, key=lambda r: parse_date(r["created_at"]))[-args.dedup_sample:]
    db.reset()
    merged = 0
    with db.session() as conn:
        for r in recent:
            try:
                lat, lng = float(r["latitude"]), float(r["longitude"])
            except ValueError:
                lat = lng = None
            res = ingest(conn, text=clean_text(r["title"], r["description"]), lat=lat, lng=lng, channel="import",
                         created_at=parse_date(r["created_at"]).isoformat(timespec="seconds"))
            merged += res["merged"]
        issues = conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0]
        biggest = conn.execute("SELECT summary, report_count FROM issues ORDER BY report_count DESC LIMIT 3").fetchall()

    report = {
        "test_complaints": len(test),
        "test_period": f">= {args.test_from} (model trained only on earlier complaints)",
        "category_accuracy_combined": acc(combined),
        "category_accuracy_keywords_only": acc(keywords),
        "top_confusions": [f"{a} -> {b}: {n}" for (a, b), n in confusion],
        "duplicate_study": {
            "complaints": len(recent),
            "merged_into_existing_issue": merged,
            "distinct_issues": issues,
            "duplicate_share_pct": round(100 * merged / len(recent), 1),
            "largest_clusters": [{"summary": b["summary"], "reports": b["report_count"]} for b in biggest],
        },
    }
    print(json.dumps(report, indent=2))
    (ROOT / "docs" / "eval_real.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
