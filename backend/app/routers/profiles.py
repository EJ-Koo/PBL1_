from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.profile import Profile, ProfileCreate

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me", response_model=Profile)
def get_my_profile(user_id: str = Depends(get_current_user_id)):
    result = supabase.table("profiles").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.post("", response_model=Profile)
def create_profile(
    profile: ProfileCreate, user_id: str = Depends(get_current_user_id)
):
    result = (
        supabase.table("profiles")
        .insert({"user_id": user_id, "nickname": profile.nickname})
        .execute()
    )
    return result.data[0]
