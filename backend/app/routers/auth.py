from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.instagram_session import InstagramSession
from app.schemas.auth import LoginStartResponse, LoginStatusResponse, SessionInfo
from app.services.instagram_login import login_manager

router = APIRouter(prefix="/api/auth/instagram", tags=["auth"])


@router.post("/login", response_model=LoginStartResponse)
def start_login():
    login_id = login_manager.start()
    return LoginStartResponse(
        login_session_id=login_id,
        message="A browser window has been opened. Log in to Instagram there, "
        "including any 2FA/checkpoint steps, then this page will update automatically.",
    )


@router.get("/login/{login_session_id}/status", response_model=LoginStatusResponse)
def login_status(login_session_id: str):
    state = login_manager.get(login_session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown login session")
    return LoginStatusResponse(
        login_session_id=state.id,
        status=state.status,
        ig_username=state.ig_username,
        detail=state.detail,
    )


@router.get("/session", response_model=SessionInfo | None)
def current_session(db: Session = Depends(get_db)):
    row = db.execute(
        select(InstagramSession)
        .where(InstagramSession.is_active.is_(True))
        .order_by(InstagramSession.updated_at.desc())
    ).scalars().first()
    return row


@router.post("/logout")
def logout(db: Session = Depends(get_db)):
    db.query(InstagramSession).filter(InstagramSession.is_active.is_(True)).update(
        {InstagramSession.is_active: False}
    )
    db.commit()
    return {"detail": "Logged out"}
