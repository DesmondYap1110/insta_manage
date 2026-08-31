from datetime import datetime

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    """Credentials arrive in the POST body only — never as query parameters."""

    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


class AdminRead(BaseModel):
    id: int
    username: str
    last_login_at: datetime | None

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)
