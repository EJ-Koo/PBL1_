from fastapi import APIRouter, HTTPException

from app.db import supabase
from app.schemas.profile import Profile, ProfileCreate

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/{profile_id}", response_model=Profile)
def get_profile(profile_id: str):
    result = supabase.table("profiles").select("*").eq("id", profile_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.post("", response_model=Profile)
def create_profile(profile: ProfileCreate):
    result = supabase.table("profiles").insert(profile.model_dump()).execute()
    return result.data[0]
