import math
import random
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.diary import Diary, DiaryCreate, DiaryUpdate

router = APIRouter(prefix="/diaries", tags=["diaries"])

PHOTO_BUCKET = "diary-photos"
PHOTO_URL_TTL = 3600

# x/y/z는 AI 클러스터링(HDBSCAN)이 들어오기 전까지 구 껍질 위 무작위 배치로 대체.
# size는 글자 길이에 비례 (스키마 주석에 명시된 규칙).
STAR_RADIUS_RANGE = (3.0, 12.0)
STAR_SIZE_RANGE = (0.25, 1.2)
STAR_SIZE_CHARS_FOR_MAX = 400

# [MODIFIED 2026-11-03] 별끼리 겹치지 않게 최소 간격을 둔다.
# 두 별 중심 거리 >= 두 별 반지름(size) 합 + STAR_MIN_GAP 이어야 "빈자리"로 본다.
# 임베딩 기반 배치가 들어오면 위치 결정 방식 자체가 바뀌므로, 지금은 무작위 후보를 여러 번 뽑는 단순한 방식만 쓴다.
STAR_MIN_GAP = 0.3
STAR_PLACEMENT_TRIES = 30
STAR_RADIUS_GROW_EVERY = 10  # 이만큼 연속으로 실패하면 배치 범위를 바깥으로 넓힌다
STAR_RADIUS_GROW_STEP = 3.0


def _random_star_position(max_radius: float = STAR_RADIUS_RANGE[1]) -> tuple[float, float, float]:
    radius = random.uniform(STAR_RADIUS_RANGE[0], max_radius)
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


def _free_star_position(size: float, others: list[dict]) -> tuple[float, float, float]:
    """기존 별(others: x, y, z, size)과 최소 간격 이상 떨어진 무작위 자리를 찾는다.
    STAR_PLACEMENT_TRIES번 안에 못 찾으면(별이 아주 많을 때) 가장 덜 붙는 자리를 쓴다."""
    best: tuple[float, float, float] | None = None
    best_gap = -math.inf
    for attempt in range(STAR_PLACEMENT_TRIES):
        max_radius = STAR_RADIUS_RANGE[1] + STAR_RADIUS_GROW_STEP * (attempt // STAR_RADIUS_GROW_EVERY)
        candidate = _random_star_position(max_radius)
        gap = min(
            (
                math.dist(candidate, (o["x"], o["y"], o["z"]))
                - (size + float(o.get("size") or STAR_SIZE_RANGE[0]))
                for o in others
            ),
            default=math.inf,
        )
        if gap >= STAR_MIN_GAP:
            return candidate
        if gap > best_gap:
            best, best_gap = candidate, gap
    assert best is not None
    return best


def _create_star_for_diary(diary_id: str, content: str, user_id: str) -> None:
    size = _star_size_for_content(content)
    # 내 기존 별들과 겹치지 않는 자리를 고른다 (다른 사용자 우주는 따로 보이므로 내 별만 비교).
    existing = (
        supabase.table("stars")
        .select("x, y, z, size, diaries!inner(user_id)")
        .eq("diaries.user_id", user_id)
        .execute()
        .data
        or []
    )
    x, y, z = _free_star_position(size, existing)
    supabase.table("stars").insert(
        {
            "diary_id": diary_id,
            "x": x,
            "y": y,
            "z": z,
            "size": size,
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
    _create_star_for_diary(created["id"], diary.content, user_id)
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
            {"size": _star_size_for_content(update_data["content"])}
        ).eq("diary_id", str(diary_id)).execute()

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
    if existing.get("photo_url"):
        try:
            supabase.storage.from_(PHOTO_BUCKET).remove([existing["photo_url"]])
        except Exception:
            pass
    return Response(status_code=204)
