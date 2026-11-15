import re
from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _owned_avatar(path: str | None, user_id: str) -> bool:
    return bool(path and re.fullmatch(re.escape(user_id) + r'/profile/[0-9a-f-]{36}\.(jpg|png|webp)', path))


def _shape(row: dict, user_id: str):
    result = {**row, 'bio': row.get('bio') or '', 'avatar_url': None}
    path = row.get('avatar_path')
    if _owned_avatar(path, user_id):
        try:
            signed = supabase.storage.from_('diary-photos').create_signed_url(path, 3600)
            result['avatar_url'] = signed.get('signedURL') or signed.get('signedUrl')
        except Exception:
            pass
    return result


@router.get("/me", response_model=Profile)
def get_my_profile(user_id: str = Depends(get_current_user_id)):
    result = supabase.table("profiles").select("*").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _shape(result.data[0], user_id)


@router.post("", response_model=Profile)
def create_profile(
    profile: ProfileCreate, user_id: str = Depends(get_current_user_id)
):
    return _save(profile.model_dump(), user_id)


def _save(values: dict, user_id: str):
    try:
        rows = supabase.table('profiles').upsert({**values, 'user_id': user_id}, on_conflict='user_id').execute().data
    except Exception:
        raise HTTPException(status_code=503, detail='프로필 저장에 실패했어요. 프로필 SQL 적용 여부와 서버 연결을 확인해주세요.')
    if not rows:
        raise HTTPException(status_code=502, detail='프로필 저장 결과를 확인하지 못했어요.')
    return _shape(rows[0], user_id)


@router.put('/me', response_model=Profile)
def update_my_profile(profile: ProfileUpdate, user_id: str = Depends(get_current_user_id)):
    if profile.avatar_path and not _owned_avatar(profile.avatar_path, user_id):
        raise HTTPException(status_code=422, detail='본인의 프로필 사진만 사용할 수 있습니다.')
    old = supabase.table('profiles').select('*').eq('user_id', user_id).execute().data
    saved = _save(profile.model_dump(), user_id)
    old_path = old[0].get('avatar_path') if old else None
    if old_path != profile.avatar_path and _owned_avatar(old_path, user_id):
        try:
            supabase.storage.from_('diary-photos').remove([old_path])
        except Exception:
            pass
    return saved
