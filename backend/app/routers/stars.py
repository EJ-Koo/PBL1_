from fastapi import APIRouter, Depends

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.star import Star

router = APIRouter(prefix="/stars", tags=["stars"])


@router.get("", response_model=list[Star])
def list_stars(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("stars")
        .select("*, diaries!inner(user_id)")
        .eq("diaries.user_id", user_id)
        .execute()
    )
    return result.data
