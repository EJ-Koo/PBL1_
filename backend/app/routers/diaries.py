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

# [MODIFIED 2026-11-03] 별끼리 겹치지 않게 최소 간격을 둔다 (AI 서비스가 없을 때의 무작위 배치에만 적용).
# 두 별 중심 거리 >= 두 별 반지름(size) 합 + STAR_MIN_GAP 이어야 "빈자리"로 본다.
# AI 배치는 AI 서비스 쪽 최소 간격(min_dist)을 따른다.
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
    # [MODIFIED 2026-11-06] 위치: AI 서비스가 일기 의미로 정한 좌표를 우선 쓴다(비슷한 기억 근처).
    # AI 서비스가 없거나 실패하면, 내 기존 별들과 겹치지 않는 무작위 자리(최소 간격)로 둔다.
    position = ai_client.place_diary(user_id, diary_id, content)
    if position is None:
        existing = (
            supabase.table("stars")
            .select("x, y, z, size, diaries!inner(user_id)")
            .eq("diaries.user_id", user_id)
            .execute()
            .data
            or []
        )
        x, y, z = _free_star_position(size, existing)
        position = {"x": x, "y": y, "z": z}
    supabase.table("stars").insert(
        {
            "diary_id": diary_id,
            **position,
            "size": size,
            # 색·밝기: AI 감정 분석 결과 (없으면 테이블 기본값)
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


# [MODIFIED 2026-11-05] 사진 여러 장(최대 5장) 지원.
# DB의 photo_paths(text[]) 컬럼에 저장 경로 목록을 두고, photo_url에는 첫 번째 경로를 같이 넣는다
# (예전 화면·관리자 화면이 photo_url 하나만 보기 때문).
# photo_paths 컬럼은 diary_galaxy_schema.sql 맨 아래 migration을 Supabase에서 실행해야 생긴다.
# 실행 전에도 서버가 죽지 않도록, 컬럼이 없으면 첫 장만 photo_url에 저장하는 예전 방식으로 동작한다.
_photo_paths_column = True


def _stored_photo_paths(diary: dict) -> list[str]:
    paths = diary.get("photo_paths") or []
    if paths:
        return list(paths)
    return [diary["photo_url"]] if diary.get("photo_url") else []


def _sign(path: str) -> str | None:
    try:
        signed = supabase.storage.from_(PHOTO_BUCKET).create_signed_url(path, PHOTO_URL_TTL)
        return signed.get("signedURL") or signed.get("signedUrl")
    except Exception:
        return None


def _with_signed_photo_url(diary: dict) -> dict:
    paths = _stored_photo_paths(diary)
    urls = [u for u in (_sign(p) for p in paths) if u]
    return {
        **diary,
        "photo_url": urls[0] if urls else None,
        "photo_urls": urls,
        "photo_paths": paths,
    }


def _remove_photos(paths: list[str]) -> None:
    if not paths:
        return
    try:
        supabase.storage.from_(PHOTO_BUCKET).remove(paths)
    except Exception:
        pass


def _is_missing_photo_paths_column(error: Exception) -> bool:
    return "photo_paths" in str(error)


def _write_diary(query_builder, row: dict):
    """photo_paths 컬럼이 아직 없으면(마이그레이션 전) 그 값만 빼고 다시 저장한다."""
    global _photo_paths_column
    if not _photo_paths_column:
        row = {k: v for k, v in row.items() if k != "photo_paths"}
    try:
        return query_builder(row).execute()
    except Exception as e:
        if "photo_paths" in row and _is_missing_photo_paths_column(e):
            _photo_paths_column = False
            return query_builder({k: v for k, v in row.items() if k != "photo_paths"}).execute()
        raise


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
    paths = diary.photo_paths or ([diary.photo_url] if diary.photo_url else [])
    row = {
        "user_id": user_id,
        "content": diary.content,
        "photo_url": paths[0] if paths else None,
        "photo_paths": paths,
        "visibility": diary.visibility,
    }
    result = _write_diary(lambda r: supabase.table("diaries").insert(r), row)
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

    old_paths = _stored_photo_paths(existing)
    new_paths = old_paths
    if "photo_paths" in update_data:
        new_paths = list(update_data["photo_paths"] or [])
    elif "photo_url" in update_data:
        new_paths = [update_data["photo_url"]] if update_data["photo_url"] else []
    if "photo_paths" in update_data or "photo_url" in update_data:
        update_data["photo_paths"] = new_paths
        update_data["photo_url"] = new_paths[0] if new_paths else None

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = _write_diary(
        lambda r: supabase.table("diaries")
        .update(r)
        .eq("id", str(diary_id))
        .eq("user_id", user_id),
        update_data,
    )

    if "content" in update_data:
        supabase.table("stars").update(
            {
                "size": _star_size_for_content(update_data["content"]),
                **(ai_client.analyze_diary(update_data["content"]) or {}),
            }
        ).eq("diary_id", str(diary_id)).execute()
        ai_client.update_diary_layout(user_id, str(diary_id), update_data["content"])

    _remove_photos([p for p in old_paths if p not in new_paths])

    return _with_signed_photo_url(result.data[0])


@router.delete("/{diary_id}", status_code=204)
def delete_diary(diary_id: UUID, user_id: str = Depends(get_current_user_id)):
    existing = _get_owned_diary(diary_id, user_id)
    supabase.table("diaries").delete().eq("id", str(diary_id)).eq(
        "user_id", user_id
    ).execute()
    ai_client.forget_diary(user_id, str(diary_id))
    _remove_photos(_stored_photo_paths(existing))
    return Response(status_code=204)
