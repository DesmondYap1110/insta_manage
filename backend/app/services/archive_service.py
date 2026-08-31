"""Harvest the signed-in user's OWN archived stories.

Instagram auto-saves your past stories to a private archive that only you can
see (instagram.com/archive/stories). Instaloader has no support for it, and a
plain cookie request to the internal endpoint returns HTML rather than JSON.

So instead we drive a real browser with the session we already captured, load
the archive page exactly as the user would, and read the JSON the page itself
fetches. Nothing is bypassed — this is the user's own data, rendered by the
same authenticated session they logged in with.

Only ever run against the account that owns the session; another user's
archive is private and is not reachable (nor attempted) here.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

ARCHIVE_URL = "https://www.instagram.com/archive/stories/"

# Responses whose bodies may carry archive reel data.
_INTERESTING = re.compile(r"(archive|reel|graphql|api/v1)", re.I)


@dataclass
class ArchiveItem:
    media_id: str
    taken_at: datetime | None
    is_video: bool
    url: str


def _coerce_timestamp(value) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return None


def _is_real_media_url(url: str | None) -> bool:
    """Reject Instagram's static site assets and placeholder images.

    The archive page embeds UI chrome (spinners, blank placeholders) served
    from static.cdninstagram.com/rsrc.php/. Those objects can carry the same
    image_versions2 shape as real media, and fetching one returns 400 — which
    previously aborted the whole download job near completion.
    """
    if not url:
        return False
    lowered = url.lower()
    if "static.cdninstagram.com" in lowered or "/rsrc.php/" in lowered:
        return False
    if lowered.rstrip("/").endswith("null.jpg"):
        return False
    return True


def _best_image(candidates: list[dict]) -> str | None:
    """Instagram returns several renditions; take the largest so we keep the
    original quality rather than a downscaled preview."""
    best = None
    best_area = -1
    for candidate in candidates or []:
        url = candidate.get("url")
        if not url:
            continue
        area = (candidate.get("width") or 0) * (candidate.get("height") or 0)
        if area >= best_area:
            best, best_area = url, area
    return best


def _best_video(versions: list[dict]) -> str | None:
    best = None
    best_area = -1
    for version in versions or []:
        url = version.get("url")
        if not url:
            continue
        area = (version.get("width") or 0) * (version.get("height") or 0)
        if area >= best_area:
            best, best_area = url, area
    return best


def _walk(node, found: dict[str, ArchiveItem]) -> None:
    """Recursively pull story-shaped objects out of arbitrary JSON.

    The archive payload shape has changed repeatedly over the years, so rather
    than pinning to one schema we look for the invariant: an object with a
    media id plus image_versions2/video_versions.
    """
    if isinstance(node, list):
        for entry in node:
            _walk(entry, found)
        return
    if not isinstance(node, dict):
        return

    has_media = "image_versions2" in node or "video_versions" in node
    media_id = node.get("pk") or node.get("id")

    if has_media and media_id:
        media_id = str(media_id).split("_")[0]
        is_video = bool(node.get("video_versions")) or node.get("media_type") == 2

        url = (
            _best_video(node.get("video_versions"))
            if is_video
            else _best_image((node.get("image_versions2") or {}).get("candidates"))
        )
        if _is_real_media_url(url):
            found[media_id] = ArchiveItem(
                media_id=media_id,
                taken_at=_coerce_timestamp(node.get("taken_at") or node.get("device_timestamp")),
                is_video=is_video,
                url=url,
            )

    for value in node.values():
        _walk(value, found)


def harvest_archive(
    cookies: dict[str, str],
    user_agent: str,
    max_scrolls: int = 400,
    headless: bool = True,
    progress_cb=None,
    stable_rounds: int = 6,
    settle_ms: int = 2200,
) -> list[ArchiveItem]:
    """Open the archive page and collect every story it loads.

    The archive is an infinite-scroll list ordered newest-first, so reaching
    old years simply requires enough scrolling. Two settings matter:

    * `max_scrolls`  — hard ceiling on scroll rounds.
    * `stable_rounds`— how many CONSECUTIVE rounds must yield no new items
      before we conclude we've hit the end. Stopping after a single quiet
      round truncates the harvest, because one slow network fetch looks
      identical to "no more data".
    """
    found: dict[str, ArchiveItem] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless)
        context = browser.new_context(user_agent=user_agent, viewport={"width": 1280, "height": 900})
        context.add_cookies(
            [
                {"name": name, "value": value, "domain": ".instagram.com", "path": "/"}
                for name, value in cookies.items()
            ]
        )

        page = context.new_page()

        def on_response(response):
            try:
                if not _INTERESTING.search(response.url):
                    return
                ctype = response.headers.get("content-type", "")
                if "json" not in ctype:
                    return
                _walk(response.json(), found)
            except Exception:
                # Bodies can be unavailable or non-JSON; skip quietly.
                pass

        page.on("response", on_response)

        page.goto(ARCHIVE_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(4000)

        # Also mine anything embedded in the initial HTML payload.
        try:
            for match in re.findall(r'\{"require":.*?\}\]\]', page.content())[:5]:
                try:
                    _walk(json.loads(match), found)
                except Exception:
                    pass
        except Exception:
            pass

        previous = -1
        quiet = 0
        for _ in range(max_scrolls):
            # Jump to the true bottom rather than nudging by a fixed delta —
            # the archive grid grows tall quickly and a fixed wheel step falls
            # behind, so the loader never re-triggers.
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.keyboard.press("End")
            page.wait_for_timeout(settle_ms)

            if progress_cb:
                progress_cb(len(found), len(found))

            if len(found) == previous:
                quiet += 1
                if quiet >= stable_rounds:
                    break
                # Give a stalled loader a nudge back up and down.
                page.evaluate("window.scrollBy(0, -1200)")
                page.wait_for_timeout(600)
            else:
                quiet = 0
            previous = len(found)

        browser.close()

    return sorted(found.values(), key=lambda item: item.taken_at or datetime.min, reverse=True)
