from fastapi import APIRouter, HTTPException

from app.db import supabase
from app.schemas.diary import Diary, DiaryCreate

router = APIRouter(prefix="/diaries", tags=["diaries"])


@router.get("", response_model=list[Diary])
def list_diaries(user_id: str):
    result = supabase.table("diaries").select("*").eq("user_id", user_id).execute()
    return result.data


@router.get("/{diary_id}", response_model=Diary)
def get_diary(diary_id: str):
    result = supabase.table("diaries").select("*").eq("id", diary_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Diary not found")
    return result.data[0]


@router.post("", response_model=Diary)
def create_diary(diary: DiaryCreate):
    result = supabase.table("diaries").insert(diary.model_dump()).execute()
    return result.data[0]
