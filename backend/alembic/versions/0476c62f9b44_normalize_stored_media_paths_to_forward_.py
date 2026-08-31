"""normalize stored media paths to forward slashes

Revision ID: 0476c62f9b44
Revises: 0f961eab400c
Create Date: 2026-08-16 01:48:26.363981

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0476c62f9b44'
down_revision: Union[str, None] = '0f961eab400c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rewrite Windows backslashes in stored relative paths to forward slashes.

    These values are served as URL segments under /files, so a path like
    `yap64\\post_image\\x.jpg` produced a URL that never resolved and every
    image/video in the library rendered broken. Rows written before the
    as_posix() fix in instaloader_service need repairing in place.
    """
    op.execute(r"UPDATE media_items SET file_path = REPLACE(file_path, '\\', '/') "
               r"WHERE file_path LIKE '%\\\\%'")
    op.execute(r"UPDATE tracked_accounts SET profile_pic_path = REPLACE(profile_pic_path, '\\', '/') "
               r"WHERE profile_pic_path LIKE '%\\\\%'")
    op.execute(r"UPDATE discovered_media SET thumbnail_path = REPLACE(thumbnail_path, '\\', '/') "
               r"WHERE thumbnail_path LIKE '%\\\\%'")


def downgrade() -> None:
    # Intentionally not reversed: backslash paths were simply broken, and
    # forward slashes work correctly on Windows too.
    pass
