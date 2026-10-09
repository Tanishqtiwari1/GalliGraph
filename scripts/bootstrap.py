"""Prepare a fresh server: create tables and the first supervisor account, and load the demo
dataset if the database is empty and CIVICPULSE_SEED_DEMO=1. Safe to run on every start."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import auth, config, db  # noqa: E402


def main() -> None:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db.init()
    with db.session() as conn:
        auth.init_users(conn)
        empty = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0] == 0
    if empty and os.getenv("CIVICPULSE_SEED_DEMO", "0") == "1":
        print("empty database: loading demo complaints")
        subprocess.run([sys.executable, str(ROOT / "scripts" / "seed.py")], check=True)
    print("bootstrap done")


if __name__ == "__main__":
    main()
