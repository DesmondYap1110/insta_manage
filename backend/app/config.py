from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8")

    database_url: str = "mysql+pymysql://root:@127.0.0.1:3306/instagram_media_manager"
    redis_url: str = "redis://127.0.0.1:6379/0"
    secret_key: str = "changeme-generate-a-real-fernet-key"
    media_root: str = "../media"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    login_timeout_seconds: int = 300
    download_request_delay_seconds: float = 1.5

    # Bootstrap credentials for the back-office login. Only ever read by
    # scripts/create_admin.py, which stores a bcrypt hash — the plaintext is
    # never written to the database.
    admin_username: str = "admin"
    admin_password: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def media_root_path(self) -> Path:
        path = Path(self.media_root)
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()
