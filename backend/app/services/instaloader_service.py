"""Wraps Instaloader with our persisted, authenticated session.

We never call Instaloader's own on-disk download helpers (Post.download() etc.)
because we want full control over file naming, and we want every downloaded
file's metadata recorded as a MediaItem row. Instead we use
InstaloaderContext.get_raw(), which is Instaloader's own authenticated,
retry/backoff-aware HTTP call — so we inherit its courteous handling of
Instagram's rate limits rather than reinventing it.
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import urlparse

import instaloader
import requests
from PIL import Image
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.discovered_media import DiscoveredMedia, MediaKind
from app.models.media_item import MediaItem, MediaType
from app.models.tracked_account import TrackedAccount
from app.services.crypto import decrypt_dict

INSTAGRAM_DOMAIN = ".instagram.com"

_CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
}

ProgressCallback = Callable[[int, int], None]


def build_authenticated_loader(cookies: dict[str, str], user_agent: str) -> instaloader.Instaloader:
    """Construct an Instaloader instance authenticated with previously-captured
    browser cookies (see services/instagram_login.py), instead of Instaloader's
    own username/password login (which we never use — we never touch the
    password at all)."""
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        post_metadata_txt_pattern="",
        quiet=True,
    )
    session = requests.Session()
    session.headers.update({"User-Agent": user_agent})
    for name, value in cookies.items():
        session.cookies.set(name, value, domain=INSTAGRAM_DOMAIN)
    loader.context._session = session
    loader.context.user_agent = user_agent

    username = loader.test_login()
    if not username:
        raise RuntimeError("Instagram session is no longer valid; please log in again.")
    loader.context.username = username
    return loader


def get_authenticated_loader(db: Session) -> instaloader.Instaloader:
    from app.models.instagram_session import InstagramSession

    row = (
        db.query(InstagramSession)
        .filter(InstagramSession.is_active.is_(True))
        .order_by(InstagramSession.updated_at.desc())
        .first()
    )
    if row is None:
        raise RuntimeError("No active Instagram session. Please connect your account first.")
    data = decrypt_dict(row.encrypted_session_blob)
    return build_authenticated_loader(data["cookies"], row.user_agent)


def fetch_profile(loader: instaloader.Instaloader, username: str) -> instaloader.Profile:
    return instaloader.Profile.from_username(loader.context, username)


def sync_profile_metadata(db: Session, loader: instaloader.Instaloader, account: TrackedAccount) -> TrackedAccount:
    profile = fetch_profile(loader, account.username)

    account.instagram_user_id = str(profile.userid)
    account.full_name = profile.full_name
    account.biography = profile.biography
    account.followers_count = profile.followers
    account.following_count = profile.followees
    account.posts_count = profile.mediacount
    account.is_private = profile.is_private
    account.last_synced_at = datetime.utcnow()

    try:
        resp = loader.context.get_raw(profile.profile_pic_url)
        ext = _guess_extension(profile.profile_pic_url, resp.headers.get("content-type"))
        settings = get_settings()
        account_dir = settings.media_root_path / account.username
        account_dir.mkdir(parents=True, exist_ok=True)
        pic_path = account_dir / f"profile_pic.{ext}"
        pic_path.write_bytes(resp.content)
        # as_posix(), not str(): these values become URL segments under /files,
        # and on Windows str() yields backslashes which never resolve.
        account.profile_pic_path = pic_path.relative_to(settings.media_root_path).as_posix()
    except Exception:
        pass  # profile pic download is best-effort; metadata sync should still succeed
    account.profile_pic_url = profile.profile_pic_url

    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@dataclass
class _PendingMedia:
    media_type: MediaType
    instagram_media_id: str
    shortcode: str | None
    caption: str | None
    taken_at: datetime | None
    url: str
    source_url: str | None
    carousel_group_id: str | None = None


def _guess_extension(url: str, content_type: str | None) -> str:
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in _CONTENT_TYPE_EXT:
            return _CONTENT_TYPE_EXT[base]
    suffix = Path(urlparse(url).path).suffix.lstrip(".")
    return suffix.lower() if suffix else "bin"


def _image_dimensions(content: bytes) -> tuple[int | None, int | None]:
    try:
        with Image.open(io.BytesIO(content)) as img:
            return img.width, img.height
    except Exception:
        return None, None


def _download_and_record(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    pending: _PendingMedia,
    force_redownload: bool,
) -> MediaItem | None:
    existing = (
        db.query(MediaItem)
        .filter(
            MediaItem.account_id == account.id,
            MediaItem.instagram_media_id == pending.instagram_media_id,
        )
        .first()
    )
    if existing and not force_redownload:
        return existing

    resp = loader.context.get_raw(pending.url)
    content = resp.content
    ext = _guess_extension(pending.url, resp.headers.get("content-type"))

    settings = get_settings()
    account_dir = settings.media_root_path / account.username / pending.media_type.value
    account_dir.mkdir(parents=True, exist_ok=True)

    stamp = (pending.taken_at or datetime.utcnow()).strftime("%Y%m%d_%H%M%S")
    # Every item in a carousel shares the same shortcode and taken_at (both
    # are the parent post's, not the item's), so falling back to shortcode
    # here would give every picture in the carousel the identical filename —
    # each download would silently overwrite the previous one on disk.
    # instagram_media_id is unique per item (it's "{mediaid}_{idx}"), so it
    # must win whenever a post has more than one file to tell apart.
    name_key = pending.instagram_media_id if pending.carousel_group_id else (pending.shortcode or pending.instagram_media_id)
    filename = f"{stamp}_{name_key}.{ext}"
    file_path = account_dir / filename

    file_path.write_bytes(content)

    is_image = pending.media_type in (
        MediaType.POST_IMAGE,
        MediaType.CAROUSEL_IMAGE,
        MediaType.STORY_IMAGE,
        MediaType.ARCHIVE_IMAGE,
    )
    width, height = _image_dimensions(content) if is_image else (None, None)

    # as_posix() so the stored value is URL-safe under /files on every OS.
    relative_path = file_path.relative_to(settings.media_root_path).as_posix()

    if existing:
        existing.file_path = relative_path
        existing.original_filename = filename
        existing.extension = ext
        existing.width = width
        existing.height = height
        existing.file_size_bytes = len(content)
        existing.download_timestamp = datetime.utcnow()
        existing.caption = pending.caption
        existing.source_url = pending.source_url
        media_item = existing
    else:
        media_item = MediaItem(
            account_id=account.id,
            media_type=pending.media_type,
            instagram_media_id=pending.instagram_media_id,
            shortcode=pending.shortcode,
            caption=pending.caption,
            taken_at=pending.taken_at,
            file_path=relative_path,
            original_filename=filename,
            extension=ext,
            width=width,
            height=height,
            file_size_bytes=len(content),
            source_url=pending.source_url,
            carousel_group_id=pending.carousel_group_id,
        )
        db.add(media_item)

    db.commit()
    db.refresh(media_item)
    return media_item


def _is_reel(post: "instaloader.Post") -> bool:
    """Best-effort reel detection.

    Instaloader's public Post API has no `product_type`/`is_reel` property —
    Instagram's GraphQL timeline query (which Instaloader uses for
    profile.get_posts()) doesn't reliably expose one either. When Instagram's
    response *does* include a "product_type" field on the raw node, "clips"
    identifies a reel; if it's absent we fall back to treating the video as a
    regular post video rather than guessing incorrectly.
    """
    node = getattr(post, "_node", {}) or {}
    return node.get("product_type") == "clips"


def _post_to_pending(post: "instaloader.Post") -> Iterable[_PendingMedia]:
    source_url = f"https://www.instagram.com/p/{post.shortcode}/"
    caption = post.caption

    if post.typename == "GraphSidecar":
        # Post objects from profile.get_posts() carry the lightweight timeline
        # payload. It normally already lists every sidecar child, but on the
        # rare account where it doesn't, a full-metadata refetch would fill
        # in the rest — except Instagram's graphql/query endpoint now 403s
        # for some sessions, and a hard failure there must not void the whole
        # post. Best-effort only: use the fuller data when the endpoint
        # cooperates, otherwise fall back to what the lightweight node has.
        try:
            post._obtain_metadata()
        except Exception:
            pass
        for idx, node in enumerate(post.get_sidecar_nodes()):
            media_type = MediaType.CAROUSEL_VIDEO if node.is_video else MediaType.CAROUSEL_IMAGE
            yield _PendingMedia(
                media_type=media_type,
                instagram_media_id=f"{post.mediaid}_{idx}",
                shortcode=post.shortcode,
                caption=caption,
                taken_at=post.date_utc,
                url=node.video_url if node.is_video else node.display_url,
                source_url=source_url,
                carousel_group_id=post.shortcode,
            )
    elif post.is_video:
        is_reel = _is_reel(post)
        yield _PendingMedia(
            media_type=MediaType.REEL if is_reel else MediaType.POST_VIDEO,
            instagram_media_id=str(post.mediaid),
            shortcode=post.shortcode,
            caption=caption,
            taken_at=post.date_utc,
            url=post.video_url,
            source_url=source_url,
        )
    else:
        yield _PendingMedia(
            media_type=MediaType.POST_IMAGE,
            instagram_media_id=str(post.mediaid),
            shortcode=post.shortcode,
            caption=caption,
            taken_at=post.date_utc,
            url=post.url,
            source_url=source_url,
        )


def _throttle() -> None:
    time.sleep(get_settings().download_request_delay_seconds)


# ---------------------------------------------------------------------------
# Discovery — fetch listings WITHOUT downloading any media bytes, so the user
# can browse everything available and choose what to download.
# ---------------------------------------------------------------------------


def _post_thumbnail_url(post: "instaloader.Post") -> str:
    """Prefer Instagram's small thumbnail so browsing doesn't pull full-size
    images. The field isn't exposed as a property, and isn't always present,
    so fall back to the display URL."""
    node = getattr(post, "_node", {}) or {}
    return node.get("thumbnail_src") or post.url


def _upsert_discovered(
    db: Session,
    account: TrackedAccount,
    *,
    instagram_media_id: str,
    shortcode: str | None,
    media_kind: MediaKind,
    is_video: bool,
    is_carousel: bool,
    item_count: int,
    caption: str | None,
    taken_at: datetime | None,
    thumbnail_url: str | None,
) -> None:
    existing = (
        db.query(DiscoveredMedia)
        .filter(
            DiscoveredMedia.account_id == account.id,
            DiscoveredMedia.instagram_media_id == instagram_media_id,
        )
        .first()
    )

    if existing is None:
        db.add(
            DiscoveredMedia(
                account_id=account.id,
                instagram_media_id=instagram_media_id,
                shortcode=shortcode,
                media_kind=media_kind,
                is_video=is_video,
                is_carousel=is_carousel,
                item_count=item_count,
                caption=caption,
                taken_at=taken_at,
                thumbnail_url=thumbnail_url,
            )
        )
    else:
        # Refresh the CDN URL (they expire) and any metadata that may have
        # changed, but keep the cached thumbnail already on disk.
        existing.thumbnail_url = thumbnail_url
        existing.caption = caption
        existing.item_count = item_count
        existing.is_carousel = is_carousel
        existing.is_video = is_video
        db.add(existing)


def discover_posts(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    limit: int = 60,
    reels_only: bool = False,
    progress_cb: ProgressCallback | None = None,
) -> int:
    profile = fetch_profile(loader, account.username)

    found = 0
    for post in profile.get_posts():
        if reels_only and not _is_reel(post):
            continue

        is_carousel = post.typename == "GraphSidecar"
        _upsert_discovered(
            db,
            account,
            instagram_media_id=str(post.mediaid),
            shortcode=post.shortcode,
            media_kind=MediaKind.REEL if _is_reel(post) else MediaKind.POST,
            is_video=post.is_video,
            is_carousel=is_carousel,
            item_count=post.mediacount if is_carousel else 1,
            caption=post.caption,
            taken_at=post.date_utc,
            thumbnail_url=_post_thumbnail_url(post),
        )
        found += 1
        db.commit()

        if progress_cb:
            progress_cb(found, limit)
        if found >= limit:
            break
        _throttle()

    return found


def discover_stories(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    progress_cb: ProgressCallback | None = None,
) -> int:
    profile = fetch_profile(loader, account.username)

    items = []
    for story in loader.get_stories(userids=[profile.userid]):
        items.extend(list(story.get_items()))

    total = len(items)
    for index, item in enumerate(items, start=1):
        _upsert_discovered(
            db,
            account,
            instagram_media_id=str(item.mediaid),
            shortcode=None,
            media_kind=MediaKind.STORY,
            is_video=item.is_video,
            is_carousel=False,
            item_count=1,
            caption=getattr(item, "caption", None),
            taken_at=item.date_utc,
            thumbnail_url=item.url,  # cover frame for videos
        )
        db.commit()
        if progress_cb:
            progress_cb(index, total)

    return total


def download_selected(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    discovered_ids: list[int],
    force_redownload: bool = False,
    progress_cb: ProgressCallback | None = None,
) -> int:
    """Download only the items the user ticked in the browser grid."""
    rows = (
        db.query(DiscoveredMedia)
        .filter(
            DiscoveredMedia.account_id == account.id,
            DiscoveredMedia.id.in_(discovered_ids),
        )
        .all()
    )

    post_rows = [r for r in rows if r.media_kind in (MediaKind.POST, MediaKind.REEL)]
    story_rows = [r for r in rows if r.media_kind == MediaKind.STORY]

    total = len(rows)
    done = 0
    count = 0

    for row in post_rows:
        if not row.shortcode:
            done += 1
            continue
        try:
            post = instaloader.Post.from_shortcode(loader.context, row.shortcode)
            for pending in _post_to_pending(post):
                _download_and_record(db, loader, account, pending, force_redownload)
                count += 1
        except Exception:
            # A single unavailable selection shouldn't void the whole batch.
            db.rollback()
        done += 1
        if progress_cb:
            progress_cb(done, total)
        _throttle()

    if story_rows:
        # Stories can't be fetched individually — pull the tray once and
        # filter to the selected ids.
        wanted = {r.instagram_media_id for r in story_rows}
        profile = fetch_profile(loader, account.username)
        for story in loader.get_stories(userids=[profile.userid]):
            for item in story.get_items():
                if str(item.mediaid) not in wanted:
                    continue
                pending = _PendingMedia(
                    media_type=MediaType.STORY_VIDEO if item.is_video else MediaType.STORY_IMAGE,
                    instagram_media_id=str(item.mediaid),
                    shortcode=None,
                    caption=getattr(item, "caption", None),
                    taken_at=item.date_utc,
                    url=item.video_url if item.is_video else item.url,
                    source_url=f"https://www.instagram.com/stories/{account.username}/{item.mediaid}/",
                )
                try:
                    _download_and_record(db, loader, account, pending, force_redownload)
                    count += 1
                except Exception:
                    db.rollback()
                done += 1
                if progress_cb:
                    progress_cb(done, total)
                _throttle()

    return count


# ---------------------------------------------------------------------------
# Archived stories (own account only)
# ---------------------------------------------------------------------------


def _archive_session(db: Session) -> tuple[dict, str, str]:
    """Decrypt the active session for the Playwright-based archive harvest."""
    from app.models.instagram_session import InstagramSession

    row = (
        db.query(InstagramSession)
        .filter(InstagramSession.is_active.is_(True))
        .order_by(InstagramSession.updated_at.desc())
        .first()
    )
    if row is None:
        raise RuntimeError("No active Instagram session. Please connect your account first.")
    return decrypt_dict(row.encrypted_session_blob)["cookies"], row.user_agent, row.ig_username


def _assert_own_account(account: TrackedAccount, session_username: str) -> None:
    """The story archive is private to its owner.

    Instagram only exposes it to the account that owns it, so refuse early with
    a clear message rather than harvesting an empty page for someone else.
    """
    if account.username.lower() != session_username.lower():
        raise RuntimeError(
            f"The story archive is private to its owner. You are signed in as "
            f"@{session_username}, so the archive of @{account.username} is not accessible."
        )


# The archive is infinite-scroll, newest-first. Reaching stories several years
# old needs hundreds of scroll rounds; stopping early silently truncates the
# result to the most recent months.
ARCHIVE_MAX_SCROLLS = 400
ARCHIVE_STABLE_ROUNDS = 8


def _archive_items(db: Session, account: TrackedAccount, max_scrolls: int, progress_cb=None):
    from app.services.archive_service import harvest_archive

    cookies, user_agent, session_username = _archive_session(db)
    _assert_own_account(account, session_username)
    return harvest_archive(
        cookies,
        user_agent,
        max_scrolls=max_scrolls,
        stable_rounds=ARCHIVE_STABLE_ROUNDS,
        settle_ms=2500,
        progress_cb=progress_cb,
    )


def discover_archive(
    db: Session,
    account: TrackedAccount,
    max_scrolls: int = ARCHIVE_MAX_SCROLLS,
    progress_cb: ProgressCallback | None = None,
) -> int:
    items = _archive_items(db, account, max_scrolls, progress_cb)

    for index, item in enumerate(items, start=1):
        _upsert_discovered(
            db,
            account,
            instagram_media_id=item.media_id,
            shortcode=None,
            media_kind=MediaKind.ARCHIVE,
            is_video=item.is_video,
            is_carousel=False,
            item_count=1,
            caption=None,
            taken_at=item.taken_at,
            thumbnail_url=item.url,
        )
        db.commit()
        if progress_cb:
            progress_cb(index, len(items))

    return len(items)


def download_archive(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    max_scrolls: int = ARCHIVE_MAX_SCROLLS,
    force_redownload: bool = False,
    progress_cb: ProgressCallback | None = None,
) -> int:
    items = _archive_items(db, account, max_scrolls)

    total = len(items)
    count = 0
    failures = 0

    for index, item in enumerate(items, start=1):
        pending = _PendingMedia(
            media_type=MediaType.ARCHIVE_VIDEO if item.is_video else MediaType.ARCHIVE_IMAGE,
            instagram_media_id=item.media_id,
            shortcode=None,
            caption=None,
            taken_at=item.taken_at,
            url=item.url,
            source_url="https://www.instagram.com/archive/stories/",
        )
        try:
            _download_and_record(db, loader, account, pending, force_redownload)
            count += 1
        except Exception:
            # One unfetchable item must not abandon the whole run. A single
            # expired/placeholder URL previously failed the job at 96%,
            # discarding the remaining (oldest) items entirely.
            db.rollback()
            failures += 1

        if progress_cb:
            progress_cb(index, total)
        _throttle()

    if failures and count == 0:
        raise RuntimeError(f"All {failures} archive items failed to download.")

    return count


def cached_thumbnail_path(row: DiscoveredMedia) -> Path | None:
    """Return the on-disk thumbnail if we already have it — no network, no
    Instagram session required.

    This is deliberately separate from fetch_thumbnail(): building an
    authenticated loader costs a live Instagram API round-trip (test_login),
    so a grid of N tiles would otherwise fire N API calls per page view and
    trip rate limits even though every file was already cached.
    """
    if not row.thumbnail_path:
        return None
    path = get_settings().media_root_path / row.thumbnail_path
    return path if path.exists() else None


def fetch_thumbnail(
    db: Session, loader: instaloader.Instaloader, row: DiscoveredMedia, username: str
) -> Path:
    """Download a discovered item's thumbnail once and store it on disk.

    Browsing would otherwise break as soon as Instagram's signed CDN URLs
    expire, and would re-hit their servers on every page view.
    """
    settings = get_settings()
    thumb_dir = settings.media_root_path / username / "_thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    resp = loader.context.get_raw(row.thumbnail_url)
    ext = _guess_extension(row.thumbnail_url, resp.headers.get("content-type"))
    path = thumb_dir / f"{row.instagram_media_id}.{ext}"
    path.write_bytes(resp.content)

    row.thumbnail_path = path.relative_to(settings.media_root_path).as_posix()
    db.add(row)
    db.commit()
    return path


def download_posts(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    force_redownload: bool = False,
    progress_cb: ProgressCallback | None = None,
    reels_only: bool = False,
) -> int:
    profile = fetch_profile(loader, account.username)
    posts = list(profile.get_posts())
    if reels_only:
        posts = [p for p in posts if _is_reel(p)]

    total = len(posts)
    count = 0
    for idx, post in enumerate(posts, start=1):
        try:
            for pending in _post_to_pending(post):
                _download_and_record(db, loader, account, pending, force_redownload)
                count += 1
        except Exception:
            # Skip an individual unfetchable post rather than losing the run.
            db.rollback()
        if progress_cb:
            progress_cb(idx, total)
        _throttle()
    return count


def download_single_post(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    shortcode: str,
    force_redownload: bool = False,
) -> int:
    post = instaloader.Post.from_shortcode(loader.context, shortcode)
    count = 0
    for pending in _post_to_pending(post):
        _download_and_record(db, loader, account, pending, force_redownload)
        count += 1
    return count


def download_stories(
    db: Session,
    loader: instaloader.Instaloader,
    account: TrackedAccount,
    force_redownload: bool = False,
    progress_cb: ProgressCallback | None = None,
) -> int:
    profile = fetch_profile(loader, account.username)

    items = []
    for story in loader.get_stories(userids=[profile.userid]):
        items.extend(list(story.get_items()))

    total = len(items)
    count = 0
    for idx, item in enumerate(items, start=1):
        media_type = MediaType.STORY_VIDEO if item.is_video else MediaType.STORY_IMAGE
        pending = _PendingMedia(
            media_type=media_type,
            instagram_media_id=str(item.mediaid),
            shortcode=None,
            caption=getattr(item, "caption", None),
            taken_at=item.date_utc,
            url=item.video_url if item.is_video else item.url,
            source_url=f"https://www.instagram.com/stories/{account.username}/{item.mediaid}/",
        )
        try:
            _download_and_record(db, loader, account, pending, force_redownload)
            count += 1
        except Exception:
            db.rollback()
        if progress_cb:
            progress_cb(idx, total)
        _throttle()
    return count
