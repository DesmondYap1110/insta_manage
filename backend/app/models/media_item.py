from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MediaType(str, PyEnum):
    POST_IMAGE = "post_image"
    POST_VIDEO = "post_video"
    CAROUSEL_IMAGE = "carousel_image"
    CAROUSEL_VIDEO = "carousel_video"
    REEL = "reel"
    STORY_IMAGE = "story_image"
    STORY_VIDEO = "story_video"
    # Archived stories — your own past stories, auto-saved by Instagram and
    # visible only to you. Distinct from highlights (public saved collections).
    ARCHIVE_IMAGE = "archive_image"
    ARCHIVE_VIDEO = "archive_video"


class MediaCategory(str, PyEnum):
    """Coarse grouping used by the Media Library tabs."""

    POST = "post"
    REEL = "reel"
    STORY = "story"
    ARCHIVE = "archive"


CATEGORY_TYPES: dict[MediaCategory, list[MediaType]] = {
    MediaCategory.POST: [
        MediaType.POST_IMAGE,
        MediaType.POST_VIDEO,
        MediaType.CAROUSEL_IMAGE,
        MediaType.CAROUSEL_VIDEO,
    ],
    MediaCategory.REEL: [MediaType.REEL],
    MediaCategory.STORY: [MediaType.STORY_IMAGE, MediaType.STORY_VIDEO],
    MediaCategory.ARCHIVE: [MediaType.ARCHIVE_IMAGE, MediaType.ARCHIVE_VIDEO],
}


class MediaItem(Base):
    """A single downloaded media file with its full Instagram metadata."""

    __tablename__ = "media_items"
    __table_args__ = (
        UniqueConstraint("account_id", "instagram_media_id", name="uq_account_media"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("tracked_accounts.id"), index=True)

    media_type: Mapped[MediaType] = mapped_column(Enum(MediaType))
    instagram_media_id: Mapped[str] = mapped_column(String(64), index=True)
    shortcode: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)

    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    download_timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    file_path: Mapped[str] = mapped_column(String(1024))
    original_filename: Mapped[str] = mapped_column(String(512))
    extension: Mapped[str] = mapped_column(String(16))
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    carousel_group_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    account: Mapped["TrackedAccount"] = relationship(back_populates="media_items")
