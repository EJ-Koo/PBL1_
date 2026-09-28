from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.diary import Diary, DiaryCreate

router = APIRouter(prefix="/diaries", tags=["diaries"])


@router.get("", response_model=list[Diary])
def list_diaries(user_id: str = Depends(get_current_user_id)):
    result = supabase.table("diaries").select("*").eq("user_id", user_id).execute()
    return result.data


@router.get("/{diary_id}", response_model=Diary)
def get_diary(diary_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("diaries")
        .select("*")
        .eq("id", diary_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Diary not found")
    return result.data[0]


@router.post("", response_model=Diary)
def create_diary(diary: DiaryCreate, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("diaries")
        .insert({"user_id": user_id, "content": diary.content})
        .execute()
    )
    return result.data[0]
