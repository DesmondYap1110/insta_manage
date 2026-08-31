"""add archive media types and job types

Revision ID: b7c438019924
Revises: 0476c62f9b44
Create Date: 2026-08-16 02:24:14.178471

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c438019924'
down_revision: Union[str, None] = '0476c62f9b44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


"""Widen three MySQL ENUMs for archived-story support.

Alembic's autogenerate does not detect added ENUM values, so every one of
these is written by hand — otherwise inserts fail at runtime with a
data-truncated error.
"""

_MEDIA_TYPES = (
    'POST_IMAGE', 'POST_VIDEO', 'CAROUSEL_IMAGE', 'CAROUSEL_VIDEO', 'REEL',
    'STORY_IMAGE', 'STORY_VIDEO', 'ARCHIVE_IMAGE', 'ARCHIVE_VIDEO',
)
_MEDIA_TYPES_OLD = _MEDIA_TYPES[:7]

_JOB_TYPES = (
    'SYNC_PROFILE', 'DOWNLOAD_POSTS', 'DOWNLOAD_REELS', 'DOWNLOAD_STORIES',
    'DOWNLOAD_SINGLE_POST', 'DISCOVER_POSTS', 'DISCOVER_REELS',
    'DISCOVER_STORIES', 'DOWNLOAD_SELECTED', 'DISCOVER_ARCHIVE',
    'DOWNLOAD_ARCHIVE',
)
_JOB_TYPES_OLD = _JOB_TYPES[:9]

_KINDS = ('POST', 'REEL', 'STORY', 'ARCHIVE')
_KINDS_OLD = _KINDS[:3]


def _enum(table: str, column: str, values, null: str = "NOT NULL") -> str:
    joined = ", ".join(f"'{v}'" for v in values)
    return f"ALTER TABLE {table} MODIFY {column} ENUM({joined}) {null}"


def upgrade() -> None:
    op.execute(_enum("media_items", "media_type", _MEDIA_TYPES))
    op.execute(_enum("download_jobs", "job_type", _JOB_TYPES))
    op.execute(_enum("discovered_media", "media_kind", _KINDS))


def downgrade() -> None:
    op.execute("DELETE FROM media_items WHERE media_type LIKE 'ARCHIVE%'")
    op.execute("DELETE FROM discovered_media WHERE media_kind = 'ARCHIVE'")
    op.execute("DELETE FROM download_jobs WHERE job_type LIKE '%ARCHIVE%'")
    op.execute(_enum("media_items", "media_type", _MEDIA_TYPES_OLD))
    op.execute(_enum("download_jobs", "job_type", _JOB_TYPES_OLD))
    op.execute(_enum("discovered_media", "media_kind", _KINDS_OLD))
