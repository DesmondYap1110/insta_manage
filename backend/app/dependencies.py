from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.admin_user import AdminUser
from app.services.security import SESSION_COOKIE_NAME, read_session_token


def get_current_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser:
    """FastAPI dependency guarding every protected route.

    Attach with `dependencies=[Depends(get_current_admin)]` on a router so
    each endpoint inside it requires a valid admin session cookie.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )

    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise unauthorized

    user_id = read_session_token(token)
    if user_id is None:
        raise unauthorized

    user = db.get(AdminUser, user_id)
    if user is None or not user.is_active:
        raise unauthorized

    return user
