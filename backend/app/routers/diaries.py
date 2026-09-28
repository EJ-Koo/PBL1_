from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.diary import Diary, DiaryCreate, DiaryUpdate

router = APIRouter(prefix="/diaries", tags=["diaries"])


def _get_owned_diary(diary_id: UUID, user_id: str) -> dict:
    result = (
        supabase.table("diaries")
        .select("*")
        .eq("id", str(diary_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Diary not found")
    return result.data[0]


def _is_editable_today(created_at: str) -> bool:
    created = datetime.fromisoformat(created_at)
    return created.astimezone(timezone.utc).date() == datetime.now(timezone.utc).date()


@router.get("", response_model=list[Diary])
def list_diaries(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("diaries")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{diary_id}", response_model=Diary)
def get_diary(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    return _get_owned_diary(diary_id, user_id)


@router.post("", response_model=Diary)
def create_diary(diary: DiaryCreate, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("diaries")
        .insert(
            {
                "user_id": user_id,
                "content": diary.content,
                "photo_url": diary.photo_url,
                "visibility": diary.visibility,
            }
        )
        .execute()
    )
    return result.data[0]


@router.patch("/{diary_id}", response_model=Diary)
def update_diary(
    diary_id: UUID, diary: DiaryUpdate, user_id: str = Depends(get_current_user_id)
):
    existing = _get_owned_diary(diary_id, user_id)
    if not _is_editable_today(existing["created_at"]):
        raise HTTPException(
            status_code=403, detail="Diary can only be edited on the day it was created"
        )

    update_data = diary.model_dump(exclude_unset=True)
    if not update_data:
        return existing

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("diaries")
        .update(update_data)
        .eq("id", str(diary_id))
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{diary_id}", status_code=204)
def delete_diary(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    _get_owned_diary(diary_id, user_id)
    supabase.table("diaries").delete().eq("id", str(diary_id)).eq(
        "user_id", user_id
    ).execute()
    return Response(status_code=204)
