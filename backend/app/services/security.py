"""Admin authentication primitives.

Passwords are stored only as bcrypt hashes — never in plaintext, never
logged, never returned by any endpoint. The browser session is a signed
(not encrypted) token in an httpOnly cookie: it carries no secret, just a
user id plus an HMAC signature the server verifies, so a stolen cookie
can't be forged or extended and JavaScript can't read it.
"""

from __future__ import annotations

import threading
import time

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import get_settings

SESSION_COOKIE_NAME = "imm_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7  # 7 days

# Brute-force damping. This is a local single-user tool, so an in-memory
# counter is enough; it resets on restart, which is acceptable here.
_MAX_FAILURES = 5
_LOCKOUT_SECONDS = 60


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _serializer() -> URLSafeTimedSerializer:
    # The Fernet key from .env doubles as the HMAC secret here. Rotating it
    # invalidates every existing admin session, which is the desired effect.
    return URLSafeTimedSerializer(get_settings().secret_key, salt="imm-admin-session")


def create_session_token(user_id: int) -> str:
    return _serializer().dumps({"uid": user_id})


def read_session_token(token: str) -> int | None:
    try:
        data = _serializer().loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid") if isinstance(data, dict) else None
    return uid if isinstance(uid, int) else None


class LoginThrottle:
    """Tracks consecutive failed logins per username."""

    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def seconds_remaining(self, key: str) -> int:
        with self._lock:
            stamps = self._failures.get(key, [])
            if len(stamps) < _MAX_FAILURES:
                return 0
            elapsed = time.time() - stamps[-1]
            remaining = _LOCKOUT_SECONDS - elapsed
            return int(remaining) + 1 if remaining > 0 else 0

    def record_failure(self, key: str) -> None:
        with self._lock:
            stamps = self._failures.setdefault(key, [])
            stamps.append(time.time())
            del stamps[:-_MAX_FAILURES]

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


login_throttle = LoginThrottle()
