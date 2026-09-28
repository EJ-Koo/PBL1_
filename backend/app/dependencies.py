from fastapi import Header, HTTPException

from app.db import supabase


def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ")
    try:
        response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not response or not response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return response.user.id
