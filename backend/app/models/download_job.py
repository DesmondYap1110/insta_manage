from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobType(str, PyEnum):
    SYNC_PROFILE = "sync_profile"
    DOWNLOAD_POSTS = "download_posts"
    DOWNLOAD_REELS = "download_reels"
    DOWNLOAD_STORIES = "download_stories"
    DOWNLOAD_SINGLE_POST = "download_single_post"
    # Browse-then-pick flow
    DISCOVER_POSTS = "discover_posts"
    DISCOVER_REELS = "discover_reels"
    DISCOVER_STORIES = "discover_stories"
    DOWNLOAD_SELECTED = "download_selected"
    # Archived (past) stories — own account only
    DISCOVER_ARCHIVE = "discover_archive"
    DOWNLOAD_ARCHIVE = "download_archive"


class JobStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class DownloadJob(Base):
    """Tracks a background Celery download/sync task for UI polling."""

    __tablename__ = "download_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("tracked_accounts.id"), index=True)

    job_type: Mapped[JobType] = mapped_column(Enum(JobType))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING)
    progress_current: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_params: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    account: Mapped["TrackedAccount"] = relationship(back_populates="download_jobs")
