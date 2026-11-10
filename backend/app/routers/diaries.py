import math
import random
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app import ai_client
from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.diary import Diary, DiaryCreate, DiaryUpdate, RelatedDiary

router = APIRouter(prefix="/diaries", tags=["diaries"])

PHOTO_BUCKET = "diary-photos"
PHOTO_URL_TTL = 3600

# x/y/z는 AI 서비스가 일기 의미로 정한 좌표(비슷한 기억 근처). AI 서비스가 없거나 실패하면
# 구 껍질 위 무작위 배치. 한 번 정한 좌표는 다른 일기가 추가·수정돼도 바뀌지 않는다.
# size는 글자 길이에 비례 (스키마 주석에 명시된 규칙).
# color/brightness는 AI 감정 분석 결과 (AI 서비스가 없거나 실패하면 테이블 기본값).
STAR_RADIUS_RANGE = (3.0, 12.0)
STAR_SIZE_RANGE = (0.25, 1.2)
STAR_SIZE_CHARS_FOR_MAX = 400


def _random_star_position() -> tuple[float, float, float]:
    radius = random.uniform(*STAR_RADIUS_RANGE)
    theta = random.uniform(0, 2 * math.pi)
    phi = math.acos(2 * random.random() - 1)
    x = radius * math.sin(phi) * math.cos(theta)
    y = radius * math.sin(phi) * math.sin(theta)
    z = radius * math.cos(phi)
    return x, y, z


def _star_size_for_content(content: str) -> float:
    min_size, max_size = STAR_SIZE_RANGE
    ratio = min(len(content) / STAR_SIZE_CHARS_FOR_MAX, 1.0)
    return min_size + (max_size - min_size) * ratio


def _create_star_for_diary(diary_id: str, content: str, user_id: str, topic: str | None = None) -> None:
    # 주제는 DB에 저장하지 않고 AI 서비스에만 넘긴다(스키마 변경 없음). 고르지 않았으면 예전과 같은 호출.
    position = ai_client.place_diary(user_id, diary_id, content, **({"topic": topic} if topic else {}))
    if position is None:
        x, y, z = _random_star_position()
        position = {"x": x, "y": y, "z": z}
    supabase.table("stars").insert(
        {
            "diary_id": diary_id,
            **position,
            "size": _star_size_for_content(content),
            **(ai_client.analyze_diary(content) or {}),
        }
    ).execute()


def _assert_owns_groups(group_ids: list[str], user_id: str) -> None:
    if not group_ids:
        return
    owned = (
        supabase.table("groups")
        .select("id")
        .eq("user_id", user_id)
        .in_("id", group_ids)
        .execute()
    )
    owned_ids = {g["id"] for g in owned.data}
    if owned_ids != set(group_ids):
        raise HTTPException(status_code=404, detail="Group not found")


def _tag_diary_groups(diary_id: str, group_ids: list[str]) -> None:
    if not group_ids:
        return
    supabase.table("diary_groups").insert(
        [{"diary_id": diary_id, "group_id": gid} for gid in group_ids]
    ).execute()


def _with_signed_photo_url(diary: dict) -> dict:
    path = diary.get("photo_url")
    if not path:
        return diary
    try:
        signed = supabase.storage.from_(PHOTO_BUCKET).create_signed_url(
            path, PHOTO_URL_TTL
        )
        return {**diary, "photo_url": signed.get("signedURL") or signed.get("signedUrl")}
    except Exception:
        return {**diary, "photo_url": None}


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
    return [_with_signed_photo_url(d) for d in result.data]


@router.get("/{diary_id}", response_model=Diary)
def get_diary(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    return _with_signed_photo_url(_get_owned_diary(diary_id, user_id))


@router.get("/{diary_id}/related", response_model=list[RelatedDiary])
def get_related_diaries(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    """이 일기와 의미가 가까운 내 일기(최대 3개, 유사도 높은 순). 관련 기억이 없거나 AI 서비스가 없으면 빈 목록.
    similarity는 코사인 유사도이며 확률이 아니다."""
    _get_owned_diary(diary_id, user_id)
    related = ai_client.related_diaries(user_id, str(diary_id)) or []
    if not related:
        return []
    rows = (
        supabase.table("diaries")
        .select("id, content, created_at")
        .eq("user_id", user_id)
        .in_("id", [r["diary_id"] for r in related])
        .execute()
    )
    by_id = {row["id"]: row for row in rows.data}
    return [
        {
            "diary_id": r["diary_id"],
            "similarity": r["similarity"],
            "content": by_id[r["diary_id"]]["content"],
            "created_at": by_id[r["diary_id"]]["created_at"],
        }
        for r in related
        if r["diary_id"] in by_id  # 다른 사용자 일기나 이미 삭제된 일기는 내보내지 않는다
    ]


@router.post("", response_model=Diary)
def create_diary(diary: DiaryCreate, user_id: str = Depends(get_current_user_id)):
    _assert_owns_groups(diary.group_ids, user_id)
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
    created = result.data[0]
    _create_star_for_diary(created["id"], diary.content, user_id, diary.topic)
    _tag_diary_groups(created["id"], diary.group_ids)
    return _with_signed_photo_url(created)


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
        return _with_signed_photo_url(existing)

    old_photo_path = existing.get("photo_url")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("diaries")
        .update(update_data)
        .eq("id", str(diary_id))
        .eq("user_id", user_id)
        .execute()
    )

    if "content" in update_data:
        supabase.table("stars").update(
            {
                "size": _star_size_for_content(update_data["content"]),
                **(ai_client.analyze_diary(update_data["content"]) or {}),
            }
        ).eq("diary_id", str(diary_id)).execute()
        ai_client.update_diary_layout(user_id, str(diary_id), update_data["content"])

    new_photo_path = update_data.get("photo_url", old_photo_path)
    if old_photo_path and old_photo_path != new_photo_path:
        try:
            supabase.storage.from_(PHOTO_BUCKET).remove([old_photo_path])
        except Exception:
            pass

    return _with_signed_photo_url(result.data[0])


@router.delete("/{diary_id}", status_code=204)
def delete_diary(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    existing = _get_owned_diary(diary_id, user_id)
    supabase.table("diaries").delete().eq("id", str(diary_id)).eq(
        "user_id", user_id
    ).execute()
    ai_client.forget_diary(user_id, str(diary_id))
    if existing.get("photo_url"):
        try:
            supabase.storage.from_(PHOTO_BUCKET).remove([existing["photo_url"]])
        except Exception:
            pass
    return Response(status_code=204)
