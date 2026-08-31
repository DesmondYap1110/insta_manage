from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MediaKind(str, PyEnum):
    """The bucket a user browses by, as opposed to MediaType which describes
    an individual downloaded file."""

    POST = "post"
    REEL = "reel"
    STORY = "story"
    ARCHIVE = "archive"


class DiscoveredMedia(Base):
    """Metadata for an item that EXISTS on Instagram but may not be downloaded.

    Populated by a "discover" job which fetches listings only — no media
    bytes — so the user can browse everything available and pick what to
    download. Downloaded files still live in media_items.
    """

    __tablename__ = "discovered_media"
    __table_args__ = (
        UniqueConstraint("account_id", "instagram_media_id", name="uq_discovered_media"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("tracked_accounts.id"), index=True)

    instagram_media_id: Mapped[str] = mapped_column(String(64), index=True)
    shortcode: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    media_kind: Mapped[MediaKind] = mapped_column(Enum(MediaKind), index=True)

    is_video: Mapped[bool] = mapped_column(Boolean, default=False)
    is_carousel: Mapped[bool] = mapped_column(Boolean, default=False)
    item_count: Mapped[int] = mapped_column(Integer, default=1)

    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    # Instagram CDN URLs are signed and expire, so the thumbnail is cached to
    # disk on first view and served from there afterwards.
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    discovered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    account: Mapped["TrackedAccount"] = relationship(back_populates="discovered_media")
