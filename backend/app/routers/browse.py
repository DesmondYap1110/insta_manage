from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.discovered_media import DiscoveredMedia, MediaKind
from app.models.download_job import DownloadJob, JobType
from app.models.media_item import MediaItem
from app.models.tracked_account import TrackedAccount
from app.schemas.discovered import (
    DiscoveredMediaPage,
    DiscoveredMediaRead,
    DiscoverRequest,
    DownloadSelectedRequest,
)
from app.schemas.job import DownloadJobRead
from app.services import instaloader_service
from app.tasks.download_tasks import (
    discover_archive_task,
    discover_posts_task,
    discover_reels_task,
    discover_stories_task,
    download_selected_task,
)

router = APIRouter(prefix="/api/browse", tags=["browse"])

_DISCOVER_TASK = {
    MediaKind.POST: (JobType.DISCOVER_POSTS, discover_posts_task),
    MediaKind.REEL: (JobType.DISCOVER_REELS, discover_reels_task),
    MediaKind.STORY: (JobType.DISCOVER_STORIES, discover_stories_task),
    MediaKind.ARCHIVE: (JobType.DISCOVER_ARCHIVE, discover_archive_task),
}

# These kinds take no numeric limit argument.
_NO_LIMIT_KINDS = {MediaKind.STORY}


def _downloaded_ids(db: Session, account_id: int) -> set[str]:
    """Which discovered items already have at least one file on disk.

    Carousel children are stored as `{mediaid}_{index}` in media_items, so the
    base id is recovered by splitting on the underscore.
    """
    rows = db.execute(
        select(MediaItem.instagram_media_id).where(MediaItem.account_id == account_id)
    ).scalars().all()
    return {value.split("_")[0] for value in rows}


@router.get("/{account_id}", response_model=DiscoveredMediaPage)
def list_discovered(
    account_id: int,
    media_kind: MediaKind | None = None,
    downloaded: bool | None = Query(None, description="Filter by download state"),
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    base = select(DiscoveredMedia).where(DiscoveredMedia.account_id == account_id)
    if media_kind is not None:
        base = base.where(DiscoveredMedia.media_kind == media_kind)

    done = _downloaded_ids(db, account_id)

    # Counts per tab, before the downloaded filter is applied.
    count_rows = db.execute(
        select(DiscoveredMedia.media_kind, func.count())
        .where(DiscoveredMedia.account_id == account_id)
        .group_by(DiscoveredMedia.media_kind)
    ).all()
    counts = {kind.value: total for kind, total in count_rows}

    rows = db.execute(base.order_by(DiscoveredMedia.taken_at.desc())).scalars().all()

    items = []
    for row in rows:
        is_downloaded = row.instagram_media_id in done
        if downloaded is not None and is_downloaded != downloaded:
            continue
        item = DiscoveredMediaRead.model_validate(row)
        item.is_downloaded = is_downloaded
        items.append(item)

    total = len(items)
    start = (page - 1) * page_size
    return DiscoveredMediaPage(
        items=items[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
        counts=counts,
    )


_THUMB_CACHE_HEADERS = {"Cache-Control": "private, max-age=86400"}


@router.get("/{account_id}/thumbnail/{discovered_id}")
def thumbnail(account_id: int, discovered_id: int, db: Session = Depends(get_db)):
    row = db.get(DiscoveredMedia, discovered_id)
    if row is None or row.account_id != account_id:
        raise HTTPException(status_code=404, detail="Not found")

    # Fast path: serve straight from disk. Critically, this avoids building an
    # authenticated Instaloader (which performs a live test_login call) — doing
    # that per tile would mean dozens of Instagram API hits per grid render.
    cached = instaloader_service.cached_thumbnail_path(row)
    if cached is not None:
        return FileResponse(cached, headers=_THUMB_CACHE_HEADERS)

    account = db.get(TrackedAccount, account_id)
    try:
        loader = instaloader_service.get_authenticated_loader(db)
        path = instaloader_service.fetch_thumbnail(db, loader, row, account.username)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Thumbnail unavailable: {exc}") from exc

    return FileResponse(path, headers=_THUMB_CACHE_HEADERS)


@router.post("/{account_id}/discover", response_model=DownloadJobRead, status_code=201)
def start_discover(account_id: int, payload: DiscoverRequest, db: Session = Depends(get_db)):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    job_type, task = _DISCOVER_TASK[payload.media_kind]
    job = DownloadJob(account_id=account.id, job_type=job_type)
    db.add(job)
    db.commit()
    db.refresh(job)

    if payload.media_kind in _NO_LIMIT_KINDS:
        async_result = task.delay(job.id)
    else:
        # For ARCHIVE the value is a scroll budget rather than an item count.
        async_result = task.delay(job.id, payload.limit)

    job.celery_task_id = async_result.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{account_id}/download-selected", response_model=DownloadJobRead, status_code=201)
def download_selected(
    account_id: int, payload: DownloadSelectedRequest, db: Session = Depends(get_db)
):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    valid_count = db.execute(
        select(func.count())
        .select_from(DiscoveredMedia)
        .where(
            DiscoveredMedia.account_id == account_id,
            DiscoveredMedia.id.in_(payload.discovered_ids),
        )
    ).scalar_one()
    if valid_count == 0:
        raise HTTPException(status_code=400, detail="No valid items selected")

    job = DownloadJob(
        account_id=account.id,
        job_type=JobType.DOWNLOAD_SELECTED,
        progress_total=valid_count,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    async_result = download_selected_task.delay(
        job.id, payload.discovered_ids, payload.force_redownload
    )
    job.celery_task_id = async_result.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{account_id}", status_code=204)
def clear_discovered(account_id: int, db: Session = Depends(get_db)):
    db.query(DiscoveredMedia).filter(DiscoveredMedia.account_id == account_id).delete()
    db.commit()
