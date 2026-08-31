from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import SessionLocal
from app.dependencies import get_current_admin
from app.models.admin_user import AdminUser
from app.routers import accounts, admin_auth, auth, browse, downloads, media
from app.services.security import SESSION_COOKIE_NAME, read_session_token

settings = get_settings()

app = FastAPI(title="Instagram Media Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public: the admin login endpoints themselves.
app.include_router(admin_auth.router)

# Everything else requires a signed-in admin.
protected = [Depends(get_current_admin)]
app.include_router(auth.router, dependencies=protected)
app.include_router(accounts.router, dependencies=protected)
app.include_router(downloads.router, dependencies=protected)
app.include_router(media.router, dependencies=protected)
app.include_router(browse.router, dependencies=protected)


@app.middleware("http")
async def protect_media_files(request: Request, call_next):
    """Gate the static media mount behind the same admin session.

    StaticFiles can't take a FastAPI dependency, so the cookie is checked
    here instead — otherwise every downloaded file would be readable by
    anyone who could reach the port, regardless of login.
    """
    if request.url.path.startswith("/files/"):
        user_id = read_session_token(request.cookies.get(SESSION_COOKIE_NAME) or "")
        authorized = False
        if user_id is not None:
            db = SessionLocal()
            try:
                user = db.get(AdminUser, user_id)
                authorized = user is not None and user.is_active
            finally:
                db.close()
        if not authorized:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    return await call_next(request)


# Serve downloaded files, e.g. GET /files/{username}/post_image/2024...jpg
# Mounted at /files (not /media) so it doesn't collide with the frontend's
# client-side /media route (the Media Library page).
app.mount("/files", StaticFiles(directory=settings.media_root_path), name="media")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the built frontend (frontend/dist) so the whole app is reachable as
# a single origin, e.g. http://<lan-ip>:8000 — needed for the Capacitor
# mobile app, which points its WebView straight at the backend instead of a
# separate dev server. Mounted last so it never shadows /api, /files or
# /docs. Falls back to index.html for client-side routes (React Router).
FRONTEND_DIST = (Path(__file__).resolve().parent.parent.parent / "frontend" / "dist")
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
