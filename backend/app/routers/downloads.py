from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.download_job import DownloadJob, JobType
from app.models.tracked_account import TrackedAccount
from app.schemas.job import DownloadJobCreate, DownloadJobRead
from app.tasks.download_tasks import (
    download_archive_task,
    download_posts_task,
    download_reels_task,
    download_single_post_task,
    download_stories_task,
    sync_profile_metadata_task,
)

router = APIRouter(prefix="/api/downloads", tags=["downloads"])

_TASK_BY_TYPE = {
    JobType.SYNC_PROFILE: sync_profile_metadata_task,
    JobType.DOWNLOAD_POSTS: download_posts_task,
    JobType.DOWNLOAD_REELS: download_reels_task,
    JobType.DOWNLOAD_STORIES: download_stories_task,
    JobType.DOWNLOAD_ARCHIVE: download_archive_task,
}


@router.post("/jobs", response_model=DownloadJobRead, status_code=201)
def create_job(payload: DownloadJobCreate, db: Session = Depends(get_db)):
    account = db.get(TrackedAccount, payload.account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.job_type == JobType.DOWNLOAD_SINGLE_POST and not payload.shortcode:
        raise HTTPException(status_code=400, detail="shortcode is required for a single post download")

    job = DownloadJob(account_id=account.id, job_type=payload.job_type)
    db.add(job)
    db.commit()
    db.refresh(job)

    if payload.job_type == JobType.DOWNLOAD_SINGLE_POST:
        async_result = download_single_post_task.delay(job.id, payload.shortcode, payload.force_redownload)
    else:
        task = _TASK_BY_TYPE[payload.job_type]
        async_result = task.delay(job.id, payload.force_redownload)

    job.celery_task_id = async_result.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[DownloadJobRead])
def list_jobs(account_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(DownloadJob).order_by(DownloadJob.created_at.desc())
    if account_id is not None:
        stmt = stmt.where(DownloadJob.account_id == account_id)
    return db.execute(stmt.limit(200)).scalars().all()


@router.get("/jobs/{job_id}", response_model=DownloadJobRead)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(DownloadJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
