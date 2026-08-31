from datetime import datetime

from pydantic import BaseModel


class LoginStartResponse(BaseModel):
    login_session_id: str
    message: str


class LoginStatusResponse(BaseModel):
    login_session_id: str
    status: str  # "waiting" | "connected" | "failed" | "timed_out" | "closed"
    ig_username: str | None = None
    detail: str | None = None


class SessionInfo(BaseModel):
    ig_username: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
