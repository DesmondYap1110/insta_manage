from datetime import datetime

from pydantic import BaseModel

from app.models.media_item import MediaType


class MediaItemRead(BaseModel):
    id: int
    account_id: int
    media_type: MediaType
    instagram_media_id: str
    shortcode: str | None
    caption: str | None
    taken_at: datetime | None
    download_timestamp: datetime
    # The frontend builds its <img>/<video> src as /files/{file_path}, so this
    # must be exposed — without it every tile requested /files/undefined.
    file_path: str
    original_filename: str
    extension: str
    width: int | None
    height: int | None
    file_size_bytes: int | None
    source_url: str | None
    carousel_group_id: str | None

    class Config:
        from_attributes = True


class MediaItemPage(BaseModel):
    items: list[MediaItemRead]
    total: int
    page: int
    page_size: int


class MediaBulkIds(BaseModel):
    ids: list[int]
