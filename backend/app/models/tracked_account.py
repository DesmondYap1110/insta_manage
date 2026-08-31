from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TrackedAccount(Base):
    """An Instagram profile the user has added to track/download."""

    __tablename__ = "tracked_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    instagram_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    biography: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_pic_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    profile_pic_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    followers_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    following_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    posts_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    media_items: Mapped[list["MediaItem"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    download_jobs: Mapped[list["DownloadJob"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    discovered_media: Mapped[list["DiscoveredMedia"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
