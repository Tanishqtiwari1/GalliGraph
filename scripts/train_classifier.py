"""Train the complaint classifier on real civic complaints.

Source: ~16k citizen complaints from Bengaluru (2019-2022) with the category the citizen chose.
Their 231 sub-categories are mapped onto CivicPulse's taxonomy, then a TF-IDF + logistic-regression
model is trained on 2019-2021 and tested on 2022 (a time split: the model never sees the future,
and near-identical repeat complaints can't leak from train into test).

Usage (from backend/):
  .venv/bin/python ../scripts/train_classifier.py [--csv ../5f99b09a-...csv]

Writes backend/models/complaint_classifier.joblib and docs/eval_real_classifier.json.
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
csv.field_size_limit(10_000_000)

DEFAULT_CSV = ROOT / "5f99b09a-64b5-45f0-ab18-4cf0a0cabf6d.csv"


def map_label(cat: str, sub: str) -> tuple[str, str]:
    """Bengaluru (category, sub-category) -> CivicPulse (category, sub_type)."""
    c, s = cat.lower(), sub.lower()
    if "animal" in c:
        if "dead" in s:
            return "garbage", "dead_animal"
        return "stray_animals", "stray_dogs" if "dog" in s else "stray_cattle" if "cattle" in s else \
            "stray_pigs" if "pig" in s else "other"
    if "electricity" in c:
        return "electricity", "transformer_pole" if ("transformer" in s or "pole" in s) else "power_outage"
    if "garbage" in c:
        if "door-to-door" in s or "sweeping" in s:
            return "garbage", "missed_collection"
        if "dustbin" in s:
            return "garbage", "overflowing_bin"
        if "dump" in s or "black spot" in s or "vacant" in s or "burning" in s:
            return "garbage", "garbage_dump"
        return "garbage", "other"
    if "yellow spot" in c or "public toilet" in c:
        if "urination" in s or "yellow spot" in s:
            return "garbage", "public_urination"
        if "toilet" in s:
            return "garbage", "public_toilet"
        if "garbage" in s or "debris" in s:
            return "garbage", "garbage_dump"
        if "broken" in s or "repair" in s:
            return "road_damage", "damaged_footpath"
        return "road_damage", "other"
    if "mobility" in c or "roads and footpaths" in c:
        if "pothole" in s:
            return "road_damage", "pothole"
        if "tarring" in s or "asphalt" in s:
            return "road_damage", "broken_road"
        if "flooding" in s or "waterlogging" in s:
            return "drainage", "waterlogging"
        if "drain" in s:
            return "drainage", "blocked_drain"
        if "footpath" in s and ("repair" in s or "broken" in s):
            return "road_damage", "damaged_footpath"
        if "debris" in s:
            return "garbage", "garbage_dump"
        if "bridge" in s or "footpath" in s:
            return "road_damage", "other"
        return "other", "other"  # hawkers, posters, signage, skywalks, cameras...
    if "sewerage" in c or "sanitation" in c:
        if "manhole" in s:
            return "drainage", "open_manhole"
        if "construction" in s:
            return "drainage", "other"
        return "drainage", "sewage_overflow"
    if "storm water" in c:
        return "drainage", "blocked_drain"
    if "street light" in c or "streetlight" in c:
        return "streetlight", "not_working" if "repair" in s else "other"
    if "traffic" in c:
        if "jam" in s or "congestion" in s:
            return "traffic", "congestion"
        if "parking" in s:
            return "traffic", "illegal_parking"
        if ("light" in s or "signal" in s) and "jumping" not in s:
            return "traffic", "signal_fault"
        if "sign board" in s:
            return "traffic", "other"
        return "traffic", "rule_violation"
    if "water supply" in c:
        if "leak" in s or "wastage" in s or "maintenance" in s:
            return "water_supply", "pipeline_leak"
        if "new" in s:
            return "water_supply", "other"
        return "water_supply", "no_supply"
    return "other", "other"  # pollution, crime, parks, trees, lakes, certificates, ...


def parse_date(s: str) -> datetime | None:
    for fmt in ("%d-%m-%Y %H:%M", "%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return None


def clean_text(title: str, desc: str) -> str:
    text = f"{title}. {desc}"
    text = text.replace("�", " ")
    text = re.sub(r"(?i)\b(respected|dear)\s+(sir|madam|sir/madam)[,.!]*|namaste\s*!?", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, classification_report, f1_score
    from sklearn.pipeline import FeatureUnion, Pipeline

    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--test-from", default="2022-01-01", help="complaints on/after this date form the test set")
    ap.add_argument("--word-features", type=int, default=15_000)
    ap.add_argument("--char-features", type=int, default=20_000)
    args = ap.parse_args()

    with open(args.csv, encoding="utf-8", errors="replace", newline="") as f:
        raw = list(csv.DictReader(f))
    split = datetime.fromisoformat(args.test_from)
    data = []
    for r in raw:
        when = parse_date(r["created_at"])
        if when is None or r["category_title"] in ("", "NULL"):
            continue
        cat, sub = map_label(r["category_title"], r["sub_category_title"])
        data.append({"text": clean_text(r["title"], r["description"]), "cat": cat, "sub": f"{cat}/{sub}",
                     "test": when >= split})
    train = [d for d in data if not d["test"]]
    test = [d for d in data if d["test"]]
    print(f"{len(data)} labelled complaints -> train {len(train)} (before {args.test_from}), test {len(test)}")
    print("category mix:", dict(Counter(d["cat"] for d in data).most_common()))

    def make_model() -> Pipeline:
        features = FeatureUnion([
            ("words", TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=args.word_features,
                                      sublinear_tf=True)),
            ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3,
                                      max_features=args.char_features, sublinear_tf=True)),
        ])
        return Pipeline([("features", features),
                         ("clf", LogisticRegression(max_iter=3000, C=4.0, class_weight="balanced"))])

    X_tr, X_te = [d["text"] for d in train], [d["text"] for d in test]
    cat_model = make_model().fit(X_tr, [d["cat"] for d in train])
    sub_model = make_model().fit(X_tr, [d["sub"] for d in train])

    pred = cat_model.predict(X_te)
    y = [d["cat"] for d in test]
    acc, macro = accuracy_score(y, pred), f1_score(y, pred, average="macro")
    sub_acc = accuracy_score([d["sub"] for d in test], sub_model.predict(X_te))
    proba = cat_model.predict_proba(X_te).max(axis=1)
    confident = proba >= 0.6
    conf_acc = accuracy_score([v for v, c in zip(y, confident) if c], [p for p, c in zip(pred, confident) if c])

    # Baseline: the keyword rules on the same real test set
    from app.extract import RuleExtractor
    rules = RuleExtractor()
    rule_pred = [rules.extract(t, use_model=False).category for t in X_te]
    rule_acc = accuracy_score(y, rule_pred)
    majority = Counter(d["cat"] for d in train).most_common(1)[0][0]

    print(f"\nTEST on {len(test)} real 2022 complaints the model never saw:")
    print(f"  category accuracy      {acc:.3f}   (macro-F1 {macro:.3f})")
    print(f"  sub-type accuracy      {sub_acc:.3f}")
    print(f"  confident (p>=0.6)     {confident.mean():.0%} of complaints, accuracy {conf_acc:.3f}")
    print(f"  keyword rules baseline {rule_acc:.3f}")
    print(f"  always-'{majority}'     {accuracy_score(y, [majority] * len(y)):.3f}")
    print(classification_report(y, pred, digits=3, zero_division=0))

    out_dir = ROOT / "backend" / "models"
    out_dir.mkdir(exist_ok=True)
    joblib.dump({"category": cat_model, "sub_type": sub_model, "trained_on": len(train),
                 "source": "Bengaluru civic complaints 2019-2021", "test_accuracy": round(acc, 4)},
                out_dir / "complaint_classifier.joblib", compress=3)
    report = {"train": len(train), "test": len(test), "test_period": f">= {args.test_from}",
              "category_accuracy": round(acc, 4), "category_macro_f1": round(macro, 4),
              "sub_type_accuracy": round(sub_acc, 4), "confident_share": round(float(confident.mean()), 4),
              "confident_accuracy": round(conf_acc, 4), "keyword_rules_accuracy": round(rule_acc, 4),
              "majority_baseline": round(accuracy_score(y, [majority] * len(y)), 4),
              "per_class": classification_report(y, pred, output_dict=True, zero_division=0)}
    (ROOT / "docs" / "eval_real_classifier.json").write_text(json.dumps(report, indent=2))
    print(f"saved model -> {out_dir / 'complaint_classifier.joblib'}")


if __name__ == "__main__":
    main()
