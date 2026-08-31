from datetime import datetime

from app.database import SessionLocal
from app.models.download_job import DownloadJob, JobStatus
from app.services import instaloader_service
from app.tasks.celery_app import celery_app


def _make_progress_cb(db, job: DownloadJob):
    def progress_cb(current: int, total: int) -> None:
        job.progress_current = current
        job.progress_total = total
        db.add(job)
        db.commit()

    return progress_cb


def _run_job(job_id: int, action) -> None:
    """Shared bookkeeping: mark the DownloadJob running/success/failed around
    whatever `action(db, loader, account, progress_cb)` actually downloads."""
    db = SessionLocal()
    try:
        job = db.get(DownloadJob, job_id)
        if job is None:
            return

        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.add(job)
        db.commit()

        try:
            loader = instaloader_service.get_authenticated_loader(db)
            account = job.account
            progress_cb = _make_progress_cb(db, job)
            action(db, loader, account, progress_cb)

            job.status = JobStatus.SUCCESS
        except Exception as exc:  # noqa: BLE001 - persist failure for the UI
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
        finally:
            job.finished_at = datetime.utcnow()
            db.add(job)
            db.commit()
    finally:
        db.close()


@celery_app.task(name="tasks.sync_profile_metadata")
def sync_profile_metadata_task(job_id: int) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.sync_profile_metadata(db, loader, account)
        progress_cb(1, 1)

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_posts")
def download_posts_task(job_id: int, force_redownload: bool = False) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_posts(
            db, loader, account, force_redownload=force_redownload, progress_cb=progress_cb
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_reels")
def download_reels_task(job_id: int, force_redownload: bool = False) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_posts(
            db,
            loader,
            account,
            force_redownload=force_redownload,
            progress_cb=progress_cb,
            reels_only=True,
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_stories")
def download_stories_task(job_id: int, force_redownload: bool = False) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_stories(
            db, loader, account, force_redownload=force_redownload, progress_cb=progress_cb
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_single_post")
def download_single_post_task(job_id: int, shortcode: str, force_redownload: bool = False) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_single_post(
            db, loader, account, shortcode, force_redownload=force_redownload
        )
        progress_cb(1, 1)

    _run_job(job_id, action)


# --- Browse-then-pick flow -------------------------------------------------


@celery_app.task(name="tasks.discover_posts")
def discover_posts_task(job_id: int, limit: int = 60) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.discover_posts(
            db, loader, account, limit=limit, progress_cb=progress_cb
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.discover_reels")
def discover_reels_task(job_id: int, limit: int = 60) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.discover_posts(
            db, loader, account, limit=limit, reels_only=True, progress_cb=progress_cb
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.discover_stories")
def discover_stories_task(job_id: int) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.discover_stories(db, loader, account, progress_cb=progress_cb)

    _run_job(job_id, action)


@celery_app.task(name="tasks.discover_archive")
def discover_archive_task(job_id: int, max_scrolls: int = 400) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.discover_archive(
            db, account, max_scrolls=max_scrolls, progress_cb=progress_cb
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_archive")
def download_archive_task(
    # force_redownload MUST stay the second positional arg: the generic
    # dispatcher in routers/downloads.py calls task.delay(job_id, force).
    # With max_scrolls second, that False landed in max_scrolls and disabled
    # scrolling entirely, silently truncating the archive to page one.
    job_id: int,
    force_redownload: bool = False,
    max_scrolls: int = 400,
) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_archive(
            db,
            loader,
            account,
            max_scrolls=max_scrolls,
            force_redownload=force_redownload,
            progress_cb=progress_cb,
        )

    _run_job(job_id, action)


@celery_app.task(name="tasks.download_selected")
def download_selected_task(
    job_id: int, discovered_ids: list[int], force_redownload: bool = False
) -> None:
    def action(db, loader, account, progress_cb):
        instaloader_service.download_selected(
            db,
            loader,
            account,
            discovered_ids,
            force_redownload=force_redownload,
            progress_cb=progress_cb,
        )

    _run_job(job_id, action)
