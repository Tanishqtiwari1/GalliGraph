"""Load a complaint CSV into the live CivicPulse database (wipes it first unless --append), then give
the history a realistic lifecycle: older issues get resolved (some late), active ones get assigned.

Usage (from backend/):  .venv/bin/python ../scripts/seed.py [--csv ../data/synthetic_complaints.csv] [--append]
"""
import argparse
import csv
import os
import random
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

# Synthetic history is loaded with the fast offline extractor unless asked otherwise
# (a local LLM would take over an hour for ~660 complaints). Must be set before app.config loads .env.
if "--use-configured-ai" not in sys.argv:
    os.environ["CIVICPULSE_EXTRACTOR"] = "rules"

from app import db  # noqa: E402
from app.pipeline import ingest, rescore_all  # noqa: E402
from app.timeutil import iso, parse, utcnow  # noqa: E402

OFFICER_ROLE = {
    "PWD / Municipal Roads": "JE (Roads)",
    "PHED (Jal Vibhag)": "AEN (PHED)",
    "Municipal Sewerage & Drainage": "JE (Sewerage)",
    "Sanitation (Swachh Bharat Cell)": "Sanitary Inspector",
    "Municipal Electrical Wing": "JE (Electrical)",
    "Municipal Veterinary & Animal Control": "Veterinary Officer",
    "Traffic Police": "Traffic Inspector",
    "JVVNL (Electricity Discom)": "AEN (JVVNL)",
    "Commissioner's Office (manual triage)": "Ward Officer",
}
# Some departments are faster than others - this is what the accountability dashboard should surface.
DEPT_SPEED = {"Sanitation (Swachh Bharat Cell)": 0.6, "Municipal Electrical Wing": 0.8, "PHED (Jal Vibhag)": 1.0,
              "PWD / Municipal Roads": 1.7, "Municipal Sewerage & Drainage": 1.3}


def simulate_lifecycle(conn, rng: random.Random, resolve_older_than_days: float) -> None:
    now = utcnow()
    cutoff = now - timedelta(days=resolve_older_than_days)
    for r in conn.execute("SELECT id, department, first_reported, last_reported, sla_hours, locality_id FROM issues").fetchall():
        first, last = parse(r["first_reported"]), parse(r["last_reported"])
        officer = f"{OFFICER_ROLE.get(r['department'], 'Ward Officer')} · Zone {rng.randint(1, 8)}"
        assigned_at = first + timedelta(hours=rng.uniform(2, 30))
        if last < cutoff:
            # Historic issue: resolved after a department-dependent delay (some miss the deadline).
            hours = r["sla_hours"] * DEPT_SPEED.get(r["department"], 1.0) * rng.uniform(0.25, 1.6)
            resolved_at = min(max(last, first + timedelta(hours=hours)), now - timedelta(hours=1))
            conn.execute("UPDATE issues SET status='resolved', resolved_at=?, assigned_officer=? WHERE id=?",
                         (iso(resolved_at), officer, r["id"]))
            conn.execute("UPDATE issue_tasks SET status='done', completed_at=? WHERE issue_id=?", (iso(resolved_at), r["id"]))
            db.log_event(conn, r["id"], iso(min(assigned_at, resolved_at)), "assignment", f"Assigned to {officer}")
            db.log_event(conn, r["id"], iso(resolved_at), "status", "Closed (imported history, no photo verification)")
        elif (now - first).days >= 1:
            status = rng.choices(["assigned", "in_progress", "open"], [0.45, 0.25, 0.30])[0]
            if status != "open":
                conn.execute("UPDATE issues SET status=?, assigned_officer=? WHERE id=?", (status, officer, r["id"]))
                db.log_event(conn, r["id"], iso(min(assigned_at, now)), "assignment", f"Assigned to {officer}")
                if status == "in_progress":
                    db.log_event(conn, r["id"], iso(min(assigned_at + timedelta(hours=rng.uniform(4, 48)), now)),
                                 "status", "Status changed assigned → in progress")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "data" / "synthetic_complaints.csv"))
    ap.add_argument("--append", action="store_true")
    ap.add_argument("--resolve-older-than-days", type=float, default=12,
                    help="issues last reported before this many days ago are treated as historic and resolved")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--use-configured-ai", action="store_true",
                    help="extract with the AI configured in backend/.env instead of offline rules (slow, may cost)")
    args = ap.parse_args()

    if args.append:
        db.init()
    else:
        db.reset()
    with open(args.csv, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    with db.session() as conn:
        for i, r in enumerate(rows, 1):
            ingest(conn, text=r["text"], lat=float(r["lat"]) if r.get("lat") else None,
                   lng=float(r["lng"]) if r.get("lng") else None, channel=r.get("channel") or "import",
                   created_at=r.get("created_at") or None)
            if i % 100 == 0:
                print(f"  {i}/{len(rows)}")
        if not args.append:
            simulate_lifecycle(conn, random.Random(args.seed), args.resolve_older_than_days)
        rescore_all(conn)
        n_issues = conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0]
        n_open = conn.execute("SELECT COUNT(*) FROM issues WHERE status != 'resolved'").fetchone()[0]
    print(f"seeded {len(rows)} complaints -> {n_issues} issues ({n_open} active)")


if __name__ == "__main__":
    main()
