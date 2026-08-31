from datetime import datetime

from pydantic import BaseModel, Field

from app.models.discovered_media import MediaKind


class DiscoveredMediaRead(BaseModel):
    id: int
    account_id: int
    instagram_media_id: str
    shortcode: str | None
    media_kind: MediaKind
    is_video: bool
    is_carousel: bool
    item_count: int
    caption: str | None
    taken_at: datetime | None
    discovered_at: datetime
    is_downloaded: bool = False

    class Config:
        from_attributes = True


class DiscoveredMediaPage(BaseModel):
    items: list[DiscoveredMediaRead]
    total: int
    page: int
    page_size: int
    counts: dict[str, int]


class DiscoverRequest(BaseModel):
    """Kick off a listing fetch. `limit` bounds how many items are pulled so a
    large account doesn't trigger a long run against Instagram's rate limits."""

    media_kind: MediaKind
    limit: int = Field(default=60, ge=1, le=500)


class DownloadSelectedRequest(BaseModel):
    discovered_ids: list[int] = Field(min_length=1)
    force_redownload: bool = False
