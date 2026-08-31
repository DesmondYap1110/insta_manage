from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin_user import AdminUser
from app.schemas.admin import AdminLoginRequest, AdminRead, ChangePasswordRequest
from app.services.security import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    create_session_token,
    hash_password,
    login_throttle,
    verify_password,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/login", response_model=AdminRead)
def login(payload: AdminLoginRequest, response: Response, db: Session = Depends(get_db)):
    key = payload.username.strip().lower()

    locked_for = login_throttle.seconds_remaining(key)
    if locked_for:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {locked_for}s.",
        )

    user = db.execute(
        select(AdminUser).where(AdminUser.username == key)
    ).scalars().first()

    # Same generic message whether the user exists or the password is wrong,
    # so the response can't be used to enumerate valid usernames.
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        login_throttle.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )

    login_throttle.reset(key)
    user.last_login_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_session_token(user.id),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,   # unreadable from JavaScript
        samesite="lax",
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"detail": "Logged out"}


@router.get("/me", response_model=AdminRead)
def me(current: AdminUser = Depends(get_current_admin)):
    return current


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    db: Session = Depends(get_db),
    current: AdminUser = Depends(get_current_admin),
):
    if not verify_password(payload.current_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current.password_hash = hash_password(payload.new_password)
    current.password_changed_at = datetime.utcnow()
    db.add(current)
    db.commit()

    # Re-issue the cookie so the active session stays valid after the change.
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_session_token(current.id),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"detail": "Password updated"}
