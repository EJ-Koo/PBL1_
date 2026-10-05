from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.db import supabase
from app.dependencies import get_current_admin_id
from app.schemas.admin import AdminLoginRequest, AdminTokenResponse

router = APIRouter(prefix="/admin/auth", tags=["admin"])

ADMIN_TOKEN_TTL = timedelta(hours=8)


@router.post("/login", response_model=AdminTokenResponse)
def admin_login(payload: AdminLoginRequest):
    result = (
        supabase.table("admins").select("*").eq("username", payload.username).execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    admin = result.data[0]
    if not bcrypt.checkpw(
        payload.password.encode(), admin["password_hash"].encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": admin["id"],
            "username": admin["username"],
            "iat": now,
            "exp": now + ADMIN_TOKEN_TTL,
        },
        settings.admin_jwt_secret,
        algorithm="HS256",
    )
    return AdminTokenResponse(
        access_token=token, admin_id=admin["id"], username=admin["username"]
    )


@router.get("/me")
def admin_me(admin_id: str = Depends(get_current_admin_id)):
    return {"admin_id": admin_id}
