from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tracked_account import TrackedAccount
from app.schemas.account import TrackedAccountCreate, TrackedAccountRead
from app.services import instaloader_service

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[TrackedAccountRead])
def list_accounts(db: Session = Depends(get_db)):
    return db.execute(select(TrackedAccount).order_by(TrackedAccount.username)).scalars().all()


@router.post("", response_model=TrackedAccountRead, status_code=201)
def add_account(payload: TrackedAccountCreate, db: Session = Depends(get_db)):
    username = payload.username.strip().lstrip("@")
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    existing = db.execute(
        select(TrackedAccount).where(TrackedAccount.username == username)
    ).scalars().first()
    if existing:
        if existing.instagram_user_id is not None:
            return existing
        # Previously added but never successfully synced (e.g. no active
        # session at the time) — fall through and retry the profile fetch.
        account = existing
    else:
        account = TrackedAccount(username=username)
        db.add(account)
        db.commit()
        db.refresh(account)

    try:
        loader = instaloader_service.get_authenticated_loader(db)
        instaloader_service.sync_profile_metadata(db, loader, account)
    except Exception as exc:
        # Account row still gets created even if the initial metadata fetch fails
        # (e.g. no active session yet) — it can be synced later.
        db.rollback()
        db.refresh(account)
        raise HTTPException(status_code=502, detail=f"Added account but could not fetch profile: {exc}") from exc

    return account


@router.get("/{account_id}", response_model=TrackedAccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/{account_id}/sync", response_model=TrackedAccountRead)
def sync_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        loader = instaloader_service.get_authenticated_loader(db)
        instaloader_service.sync_profile_metadata(db, loader, account)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(TrackedAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
