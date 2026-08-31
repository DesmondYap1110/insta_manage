from datetime import datetime

from pydantic import BaseModel


class TrackedAccountCreate(BaseModel):
    username: str


class TrackedAccountRead(BaseModel):
    id: int
    username: str
    instagram_user_id: str | None
    full_name: str | None
    biography: str | None
    profile_pic_path: str | None
    profile_pic_url: str | None
    followers_count: int | None
    following_count: int | None
    posts_count: int | None
    is_private: bool
    last_synced_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True
