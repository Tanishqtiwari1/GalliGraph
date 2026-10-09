"""Measure CivicPulse against ground truth.

Replays a labelled complaint CSV through the full pipeline (in a throwaway database) and reports:
  * category accuracy
  * duplicate detection: pairwise precision / recall / F1 over "same real-world issue" pairs
  * compression: complaints -> issues found vs true issues
  * whether the planted spike was detected
  * average processing time

Usage (from backend/):  .venv/bin/python ../scripts/evaluate.py [--csv ../data/synthetic_complaints.csv] [--json out.json]
"""
import argparse
import csv
import json
import os
import sys
import tempfile
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("CIVICPULSE_DB", str(Path(tempfile.gettempdir()) / "civicpulse_eval.db"))

from app import config, db, extract, trends  # noqa: E402
from app.pipeline import ingest  # noqa: E402


def pairs(groups: dict) -> set:
    out = set()
    for members in groups.values():
        out.update(combinations(sorted(members), 2))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "data" / "synthetic_complaints.csv"))
    ap.add_argument("--limit", type=int, default=None, help="only the first N complaints (saves API cost)")
    ap.add_argument("--json", help="write metrics to this file")
    args = ap.parse_args()

    with open(args.csv, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))[: args.limit]

    db.reset()
    pred_issue, gt_issue, cat_ok, ms = {}, {}, 0, []
    confusion = Counter()
    with db.session() as conn:
        for i, r in enumerate(rows):
            res = ingest(conn, text=r["text"], lat=float(r["lat"]) if r["lat"] else None,
                         lng=float(r["lng"]) if r["lng"] else None, channel=r.get("channel") or "import",
                         created_at=r["created_at"])
            pred_issue[i] = res["issue"]["id"]
            gt_issue[i] = r["gt_issue"]
            got = res["complaint"]["category"]
            cat_ok += got == r["gt_category"]
            confusion[(r["gt_category"], got)] += 1
            ms.append(res["complaint"]["processing_ms"])
            if (i + 1) % 100 == 0:
                print(f"  processed {i + 1}/{len(rows)}", file=sys.stderr)
        alerts = trends.spike_alerts(conn)

    pred_groups, gt_groups = defaultdict(list), defaultdict(list)
    for i in pred_issue:
        pred_groups[pred_issue[i]].append(i)
        gt_groups[gt_issue[i]].append(i)
    P, G = pairs(pred_groups), pairs(gt_groups)
    tp = len(P & G)
    precision = tp / len(P) if P else 1.0
    recall = tp / len(G) if G else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    spike_hit = any(a["locality_id"] == "malviya_nagar" and a["category"] == "drainage" for a in alerts)
    metrics = {
        "extractor": extract.active_extractor_name(),
        "complaints": len(rows),
        "true_issues": len(gt_groups),
        "predicted_issues": len(pred_groups),
        "category_accuracy": round(cat_ok / len(rows), 4),
        "dedup_precision": round(precision, 4),
        "dedup_recall": round(recall, 4),
        "dedup_f1": round(f1, 4),
        "spike_detected": spike_hit,
        "alerts": [a["message"] for a in alerts],
        "avg_processing_ms": round(sum(ms) / len(ms), 1),
        "thresholds": {"merge": config.DEDUP_MERGE_THRESHOLD, "review": config.DEDUP_REVIEW_THRESHOLD},
    }
    mistakes = {f"{g}->{p}": n for (g, p), n in confusion.most_common() if g != p}

    print(json.dumps(metrics, indent=2))
    if mistakes:
        print("category confusions:", json.dumps(dict(list(mistakes.items())[:8])))
    if args.json:
        Path(args.json).write_text(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
