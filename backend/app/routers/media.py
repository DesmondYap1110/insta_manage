import os
import tempfile
import zipfile
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.config import get_settings
from app.database import get_db
from app.models.media_item import CATEGORY_TYPES, MediaCategory, MediaItem, MediaType
from app.schemas.media import MediaBulkIds, MediaItemPage, MediaItemRead

router = APIRouter(prefix="/api/media", tags=["media"])


def _apply_filters(
    stmt,
    *,
    account_id: int | None = None,
    media_type: MediaType | None = None,
    category: MediaCategory | None = None,
    year: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Shared WHERE-clause builder so list/count/id-lookup endpoints filter identically."""
    if account_id is not None:
        stmt = stmt.where(MediaItem.account_id == account_id)
    if category is not None:
        stmt = stmt.where(MediaItem.media_type.in_(CATEGORY_TYPES[category]))
    if media_type is not None:
        stmt = stmt.where(MediaItem.media_type == media_type)
    if year is not None:
        stmt = stmt.where(extract("year", MediaItem.taken_at) == year)
    if date_from is not None:
        stmt = stmt.where(MediaItem.taken_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        # date_to is inclusive of the whole day, so filter below the *next* day.
        stmt = stmt.where(
            MediaItem.taken_at < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)
        )
    return stmt


@router.get("/categories")
def category_counts(
    account_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    """Per-category totals that drive the Media Library tabs."""
    stmt = select(MediaItem.media_type, func.count()).group_by(MediaItem.media_type)
    stmt = _apply_filters(stmt, account_id=account_id, date_from=date_from, date_to=date_to)

    by_type = {media_type: total for media_type, total in db.execute(stmt).all()}

    counts = {
        category.value: sum(by_type.get(t, 0) for t in types)
        for category, types in CATEGORY_TYPES.items()
    }
    counts["all"] = sum(by_type.values())
    return counts


@router.get("/years")
def year_counts(
    account_id: int | None = None,
    category: MediaCategory | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    """Per-year totals for the Media Library year filter.

    Grouped on taken_at (when it was posted), not download_timestamp, so the
    years reflect the content's own timeline.
    """
    year_col = extract("year", MediaItem.taken_at)
    stmt = (
        select(year_col.label("year"), func.count())
        .where(MediaItem.taken_at.is_not(None))
        .group_by(year_col)
        .order_by(year_col.desc())
    )
    stmt = _apply_filters(
        stmt, account_id=account_id, category=category, date_from=date_from, date_to=date_to
    )

    return [{"year": int(year), "count": total} for year, total in db.execute(stmt).all()]


@router.get("/ids")
def matching_ids(
    account_id: int | None = None,
    media_type: MediaType | None = None,
    category: MediaCategory | None = None,
    year: int | None = Query(None, ge=2000, le=2100),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    """Every id matching the current filters, unpaginated — backs "select all"
    in the UI, since the visible grid is paginated but selection should be
    able to span every page a filter matches."""
    stmt = select(MediaItem.id)
    stmt = _apply_filters(
        stmt,
        account_id=account_id,
        media_type=media_type,
        category=category,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    return db.execute(stmt).scalars().all()


@router.get("", response_model=MediaItemPage)
def list_media(
    account_id: int | None = None,
    media_type: MediaType | None = None,
    category: MediaCategory | None = None,
    year: int | None = Query(None, ge=2000, le=2100),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=200),
    db: Session = Depends(get_db),
):
    stmt = select(MediaItem)
    count_stmt = select(func.count()).select_from(MediaItem)
    filter_kwargs = dict(
        account_id=account_id,
        media_type=media_type,
        category=category,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    stmt = _apply_filters(stmt, **filter_kwargs)
    count_stmt = _apply_filters(count_stmt, **filter_kwargs)

    total = db.execute(count_stmt).scalar_one()
    stmt = stmt.order_by(MediaItem.taken_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = db.execute(stmt).scalars().all()

    return MediaItemPage(items=items, total=total, page=page, page_size=page_size)


@router.post("/bulk-delete")
def bulk_delete_media(payload: MediaBulkIds, db: Session = Depends(get_db)):
    if not payload.ids:
        return {"deleted": 0}

    settings = get_settings()
    items = db.execute(select(MediaItem).where(MediaItem.id.in_(payload.ids))).scalars().all()

    deleted = 0
    for item in items:
        file_path = settings.media_root_path / item.file_path
        if file_path.exists():
            file_path.unlink()
        db.delete(item)
        deleted += 1

    db.commit()
    return {"deleted": deleted}


@router.post("/export")
def export_media(payload: MediaBulkIds, db: Session = Depends(get_db)):
    """Zips the selected files and streams them back as one download."""
    if not payload.ids:
        raise HTTPException(status_code=400, detail="No items selected")

    settings = get_settings()
    items = db.execute(select(MediaItem).where(MediaItem.id.in_(payload.ids))).scalars().all()

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp.close()

    seen_names: set[str] = set()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_STORED) as zf:
        for item in items:
            file_path = settings.media_root_path / item.file_path
            if not file_path.exists():
                continue
            name = item.original_filename or file_path.name
            if name in seen_names:
                name = f"{item.id}_{name}"
            seen_names.add(name)
            zf.write(file_path, arcname=name)

    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename="media_export.zip",
        background=BackgroundTask(os.unlink, tmp.name),
    )


@router.get("/{media_id}", response_model=MediaItemRead)
def get_media_item(media_id: int, db: Session = Depends(get_db)):
    item = db.get(MediaItem, media_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Media item not found")
    return item


@router.delete("/{media_id}", status_code=204)
def delete_media_item(media_id: int, db: Session = Depends(get_db)):
    item = db.get(MediaItem, media_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Media item not found")

    settings = get_settings()
    file_path = settings.media_root_path / item.file_path
    if file_path.exists():
        file_path.unlink()

    db.delete(item)
    db.commit()
