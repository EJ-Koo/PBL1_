from fastapi import APIRouter, Depends, HTTPException, Response
from supabase import AuthApiError

from app.db import supabase
from app.dependencies import get_current_admin_id
from app.routers.diaries import (
    _remove_photos,
    _stored_photo_paths,
    _with_signed_photo_url,
)
from app.schemas.admin import AdminDiaryOut, AdminUserOut

router = APIRouter(prefix="/admin", tags=["admin"])


def _nickname_by_user_id() -> dict[str, str]:
    profiles = supabase.table("profiles").select("user_id, nickname").execute().data
    return {p["user_id"]: p["nickname"] for p in profiles}


def _list_all_auth_users() -> list:
    per_page = 1000
    auth_users = []
    page = 1
    while True:
        batch = supabase.auth.admin.list_users(page=page, per_page=per_page)
        auth_users.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return auth_users


@router.get("/users", response_model=list[AdminUserOut])
def list_users(admin_id: str = Depends(get_current_admin_id)):
    auth_users = _list_all_auth_users()
    nickname_by_user_id = _nickname_by_user_id()
    return [
        AdminUserOut(
            user_id=u.id,
            email=u.email,
            nickname=nickname_by_user_id.get(u.id),
            created_at=u.created_at.isoformat(),
        )
        for u in auth_users
    ]


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, admin_id: str = Depends(get_current_admin_id)):
    diaries = (
        supabase.table("diaries").select("*").eq("user_id", user_id).execute().data
    )
    _remove_photos([p for d in diaries for p in _stored_photo_paths(d)])
    try:
        supabase.auth.admin.delete_user(user_id)
    except AuthApiError as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="User not found")
        raise
    return Response(status_code=204)


@router.get("/diaries", response_model=list[AdminDiaryOut])
def list_all_diaries(admin_id: str = Depends(get_current_admin_id)):
    result = (
        supabase.table("diaries").select("*").order("created_at", desc=True).execute()
    )
    nickname_by_user_id = _nickname_by_user_id()
    return [
        {**_with_signed_photo_url(d), "nickname": nickname_by_user_id.get(d["user_id"])}
        for d in result.data
    ]


@router.delete("/diaries/{diary_id}", status_code=204)
def delete_diary(diary_id: str, admin_id: str = Depends(get_current_admin_id)):
    existing = supabase.table("diaries").select("*").eq("id", diary_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Diary not found")

    supabase.table("diaries").delete().eq("id", diary_id).execute()

    _remove_photos(_stored_photo_paths(existing.data[0]))
    return Response(status_code=204)
