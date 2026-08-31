from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InstagramSession(Base):
    """A logged-in Instagram browser session, persisted encrypted.

    Only ever one row has is_active=True at a time — that's the session
    Instaloader uses for authenticated requests.
    """

    __tablename__ = "instagram_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    ig_username: Mapped[str] = mapped_column(String(255), index=True)
    encrypted_session_blob: Mapped[str] = mapped_column(Text)
    user_agent: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
