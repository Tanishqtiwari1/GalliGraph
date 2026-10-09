"""Create an official account for the officials' portal.

Usage (from backend/):
  .venv/bin/python ../scripts/create_user.py <username> --role official|supervisor --name "JE (Roads) Zone 3" [--department "PWD / Municipal Roads"]
The password is asked for interactively (never pass it on the command line).
"""
import argparse
import getpass
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, db  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("username")
    ap.add_argument("--role", choices=auth.ROLES, default="official")
    ap.add_argument("--name", required=True, help="display name shown in the audit trail")
    ap.add_argument("--department", default=None)
    args = ap.parse_args()

    password = getpass.getpass("Password (min 8 characters): ")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    db.init()
    with db.session() as conn:
        auth.init_users(conn)
        try:
            auth.create_user(conn, args.username, password, args.role, args.name, args.department)
        except (ValueError, sqlite3.IntegrityError) as exc:
            sys.exit(f"Could not create user: {exc}")
    print(f"Created {args.role} '{args.username}'.")


if __name__ == "__main__":
    main()
