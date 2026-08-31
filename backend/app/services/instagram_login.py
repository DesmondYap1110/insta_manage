"""Browser-based Instagram login.

The backend never sees the user's Instagram password. We launch a real,
visible (headed) Chromium window pointed at Instagram's own login page; the
user types their credentials and completes any 2FA/checkpoint challenge
directly in that window, exactly as they would in a normal browser. We only
ever read the resulting session cookies once login succeeds.

This runs Playwright's *sync* API inside a plain background thread (not a
Celery task) because it needs to own a live, visible desktop browser window
and be polled at short, tight intervals — a fit for an in-process thread on
a local single-user machine, not a distributed worker queue.
"""

from __future__ import annotations

import asyncio
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from playwright.sync_api import sync_playwright
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models.instagram_session import InstagramSession
from app.services.crypto import encrypt_dict
from app.services.instaloader_service import build_authenticated_loader

LOGIN_URL = "https://www.instagram.com/accounts/login/"
POLL_INTERVAL_SECONDS = 1.5


@dataclass
class LoginSessionState:
    id: str
    status: str = "waiting"  # waiting | connected | failed | timed_out | closed
    ig_username: str | None = None
    detail: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


class LoginSessionManager:
    """In-memory registry of in-progress browser login attempts.

    Fine for a single-process, single-user local tool; state does not need
    to survive a backend restart since a login attempt only lives a few
    minutes anyway.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, LoginSessionState] = {}
        self._lock = threading.Lock()

    def start(self) -> str:
        login_id = str(uuid.uuid4())
        with self._lock:
            self._sessions[login_id] = LoginSessionState(id=login_id)
        thread = threading.Thread(target=self._run, args=(login_id,), daemon=True)
        thread.start()
        return login_id

    def get(self, login_id: str) -> LoginSessionState | None:
        with self._lock:
            return self._sessions.get(login_id)

    def _set(self, login_id: str, **updates) -> None:
        with self._lock:
            state = self._sessions.get(login_id)
            if state is None:
                return
            for key, value in updates.items():
                setattr(state, key, value)

    def _run(self, login_id: str) -> None:
        settings = get_settings()
        deadline = time.time() + settings.login_timeout_seconds

        # uvicorn forces WindowsSelectorEventLoopPolicy for its own loop, but a
        # selector loop can't spawn subprocesses on Windows — and Playwright's
        # sync API creates a fresh loop in this thread to spawn the browser as
        # one. This thread never touches uvicorn's own (already-running) loop,
        # so switching the process-wide policy just for this thread's login is
        # safe; it's restored once the browser is done with it.
        previous_policy = None
        if sys.platform == "win32":
            previous_policy = asyncio.get_event_loop_policy()
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=False)
                context = browser.new_context()
                page = context.new_page()
                page.goto(LOGIN_URL)

                logged_in = False
                while time.time() < deadline:
                    if page.is_closed():
                        self._set(login_id, status="closed", detail="Browser window was closed before login completed.")
                        browser.close()
                        return

                    cookies = {c["name"]: c["value"] for c in context.cookies()}
                    if cookies.get("sessionid") and cookies.get("ds_user_id"):
                        logged_in = True
                        break

                    time.sleep(POLL_INTERVAL_SECONDS)

                if not logged_in:
                    self._set(login_id, status="timed_out", detail="Login was not completed in time.")
                    browser.close()
                    return

                cookies = {c["name"]: c["value"] for c in context.cookies()}
                user_agent = page.evaluate("navigator.userAgent")
                browser.close()

            username = self._persist_session(cookies, user_agent)
            self._set(login_id, status="connected", ig_username=username)

        except Exception as exc:  # noqa: BLE001 - surface any failure to the poller
            # Some exceptions (e.g. NotImplementedError) stringify to "" —
            # fall back to the type name so the UI never shows a blank reason.
            self._set(login_id, status="failed", detail=str(exc) or type(exc).__name__)
        finally:
            if previous_policy is not None:
                asyncio.set_event_loop_policy(previous_policy)

    @staticmethod
    def _persist_session(cookies: dict[str, str], user_agent: str) -> str:
        loader = build_authenticated_loader(cookies, user_agent)
        username = loader.context.username

        db: Session = SessionLocal()
        try:
            db.query(InstagramSession).filter(InstagramSession.is_active.is_(True)).update(
                {InstagramSession.is_active: False}
            )
            db.add(
                InstagramSession(
                    ig_username=username,
                    encrypted_session_blob=encrypt_dict({"cookies": cookies}),
                    user_agent=user_agent,
                    is_active=True,
                )
            )
            db.commit()
        finally:
            db.close()

        return username


login_manager = LoginSessionManager()
