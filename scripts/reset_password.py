"""Reset an official's password (run on the server by an administrator).

Usage (from backend/):  .venv/bin/python ../scripts/reset_password.py <username>
The new password is asked for interactively and never shown or passed on the command line.
"""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, db  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: reset_password.py <username>")
    username = sys.argv[1].strip().lower()
    db.init()
    with db.session() as conn:
        auth.init_users(conn)
        users = [r["username"] for r in conn.execute("SELECT username FROM users ORDER BY username")]
    if username not in users:
        sys.exit(f"No account '{username}'. Existing accounts: {', '.join(users) or 'none'}")

    password = getpass.getpass(f"New password for {username} (min 8 characters): ")
    if len(password) < 8:
        sys.exit("Password must be at least 8 characters.")
    if password != getpass.getpass("Repeat new password: "):
        sys.exit("Passwords do not match.")
    with db.session() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (auth.hash_password(password), username))
        uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
        auth.revoke_sessions(conn, uid)
    print(f"Password for '{username}' updated. Every open session for this account has been signed out.")


if __name__ == "__main__":
    main()
