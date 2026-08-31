"""Seed or reset the back-office admin account.

    venv\\Scripts\\python -m scripts.create_admin

Reads ADMIN_USERNAME / ADMIN_PASSWORD from .env, stores only a bcrypt hash,
and prints nothing sensitive. Safe to re-run: it resets the password of an
existing user rather than creating a duplicate.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.admin_user import AdminUser  # noqa: E402
from app.services.security import hash_password  # noqa: E402


def main() -> int:
    settings = get_settings()
    username = settings.admin_username.strip().lower()
    password = settings.admin_password

    if not username:
        print("ERROR: ADMIN_USERNAME is empty in .env")
        return 1
    if not password:
        print("ERROR: ADMIN_PASSWORD is empty in .env")
        return 1
    if len(password) < 8:
        print("WARNING: password is shorter than 8 characters — change it after logging in.")

    db = SessionLocal()
    try:
        user = db.execute(
            select(AdminUser).where(AdminUser.username == username)
        ).scalars().first()

        if user is None:
            db.add(AdminUser(username=username, password_hash=hash_password(password)))
            action = "created"
        else:
            user.password_hash = hash_password(password)
            user.is_active = True
            db.add(user)
            action = "password reset"

        db.commit()
    finally:
        db.close()

    print(f"Admin user '{username}' {action}.")
    print("Only the bcrypt hash was stored. Log in at http://localhost:5173")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
