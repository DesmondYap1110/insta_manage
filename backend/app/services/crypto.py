import json
from functools import lru_cache

from cryptography.fernet import Fernet

from app.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    return Fernet(settings.secret_key.encode())


def encrypt_dict(data: dict) -> str:
    raw = json.dumps(data).encode("utf-8")
    return _fernet().encrypt(raw).decode("utf-8")


def decrypt_dict(token: str) -> dict:
    raw = _fernet().decrypt(token.encode("utf-8"))
    return json.loads(raw.decode("utf-8"))
