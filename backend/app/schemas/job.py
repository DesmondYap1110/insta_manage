from datetime import datetime

from pydantic import BaseModel

from app.models.download_job import JobStatus, JobType


class DownloadJobCreate(BaseModel):
    account_id: int
    job_type: JobType
    shortcode: str | None = None  # required for DOWNLOAD_SINGLE_POST
    force_redownload: bool = False


class DownloadJobRead(BaseModel):
    id: int
    account_id: int
    job_type: JobType
    status: JobStatus
    progress_current: int
    progress_total: int
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    class Config:
        from_attributes = True
