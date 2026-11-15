"""[NEW FILE 2026-11-15] 나만의 별자리(Level 4) API.

GET  /constellations/personal          내 개인화 별자리 목록(주제별 0~1개). LLM 을 부르지 않는다(저장된 값만).
POST /constellations/personal          {topic, consent} — 사용자가 '나만의 별자리 생성하기'를 눌렀을 때만.
                                        서버가 그 주제 일기 수를 다시 세고(30개 이상), 이미 만들었거나 만드는 중이면
                                        LLM 을 다시 부르지 않고 저장된 행을 돌려준다.

중복 호출 방지
    - personal_constellations 의 (user_id, topic) 고유 제약 → 같은 주제는 한 행만 생긴다.
    - 처음 누르면 insert(status=pending, run_id=새 값)에 성공한 요청만 생성 작업을 시작한다.
    - 실패(failed)·멈춤(pending 이 오래됨) 상태에서 다시 시도할 때는 '이전 run_id 와 상태가 그대로일 때만' update 하는
      비교 후 교체로 한 요청만 작업을 맡는다. 생성 결과도 자기 run_id 일 때만 저장한다.
    - 시도 횟수 제한(personal_constellation_max_attempts).
생성은 응답을 돌려준 뒤 백그라운드에서 진행하고, 단계(stage)를 DB에 실제 진행대로 기록한다. 화면은 이 값을 읽어 표시한다.
한 번 만든 별자리(ready)는 일기가 늘어도 바꾸지 않는다.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import get_args

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from postgrest.exceptions import APIError

from app import ai_client, constellation_llm, llm_client
from app.config import settings
from app.db import supabase
from app.dependencies import get_current_user_id
from app.routers.diaries import is_missing_column, mark_topic_column_missing, topic_column_ready
from app.schemas.constellation import PersonalConstellation, PersonalConstellationCreate
from app.schemas.diary import Topic

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/constellations", tags=["constellations"])

TABLE = "personal_constellations"
_TOPICS = set(get_args(Topic))

USER_MESSAGES = {
    "not_configured": "나만의 별자리 기능이 아직 준비되지 않았어요.",
    "auth": "AI 서비스 설정 문제로 별자리를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    "quota": "AI 서비스 사용량이 모두 소진되어 별자리를 만들지 못했어요. 나중에 다시 시도해 주세요.",
    "bad_request": "AI 서비스 요청이 거절되어 별자리를 만들지 못했어요.",
    "rate_limited": "AI 서비스에 요청이 많아 별자리를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    "server": "AI 서비스가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.",
    "network": "AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    "refusal": "이 기록으로는 별자리 콘셉트를 정하지 못했어요.",
    "unsafe_concept": "이 기록으로는 알맞은 별자리 콘셉트를 정하지 못했어요.",
    "truncated": "AI 응답이 중간에 끊겨 별자리를 만들지 못했어요. 다시 시도해 주세요.",
    "bad_response": "AI 응답을 해석하지 못했어요. 다시 시도해 주세요.",
    "bad_concept": "AI 응답을 해석하지 못했어요. 다시 시도해 주세요.",
    "no_content": "분석할 일기 내용이 없어요.",
    "stalled": "별자리 만들기가 중간에 멈췄어요. 다시 시도해 주세요.",
    "internal": "별자리를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tag(user_id: str, topic: str) -> str:
    """로그용 식별자(사용자 id 원문 대신 해시 앞부분)."""
    return hashlib.sha256(user_id.encode()).hexdigest()[:10] + ":" + topic


def _parse_time(value) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _is_stale(row: dict) -> bool:
    if row.get("status") != "pending":
        return False
    updated = _parse_time(row.get("updated_at"))
    if updated is None:
        return True
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - updated).total_seconds() > settings.personal_constellation_stale_seconds


def _public(row: dict) -> dict:
    status, error_code = row.get("status"), row.get("error_code")
    if _is_stale(row):
        status, error_code = "failed", "stalled"
    attempts_left = max(0, settings.personal_constellation_max_attempts - int(row.get("attempts") or 0))
    ready = status == "ready"
    return {
        "topic": row["topic"],
        "status": status,
        "stage": "failed" if status == "failed" else row.get("stage") or "queued",
        "name": row.get("name") if ready else None,
        "concept": row.get("concept") if ready else None,
        "shape_label": row.get("shape_label") if ready else None,
        "description": row.get("description") if ready else None,
        "reason": row.get("reason") if ready else None,
        "keywords": row.get("keywords") or [] if ready else [],
        "analysis": row.get("analysis") or {} if ready else {},
        "points": row.get("points") if ready else None,
        "connections": row.get("connections") if ready else None,
        "planet_ids": [str(x) for x in (row.get("planet_ids") or [])] if ready else [],
        "required_planets": int(row.get("required_planets") or settings.personal_constellation_threshold),
        "source_diary_count": row.get("source_diary_count"),
        "shape_source": row.get("shape_source") if ready else None,
        "created_at": row.get("created_at"),
        "completed_at": row.get("completed_at"),
        "attempts_left": attempts_left,
        "error_code": error_code if status == "failed" else None,
        "error_message": USER_MESSAGES.get(error_code or "", USER_MESSAGES["internal"]) if status == "failed" else None,
    }


def _get(user_id: str, topic: str) -> dict | None:
    rows = supabase.table(TABLE).select("*").eq("user_id", user_id).eq("topic", topic).execute().data
    return rows[0] if rows else None


def _cas(row_id: str, run_id: str, status: str, values: dict) -> list[dict]:
    """이전 run_id·상태가 그대로일 때만 바꾼다(다른 요청이 먼저 바꿨으면 빈 목록)."""
    return (
        supabase.table(TABLE)
        .update(values | {"updated_at": _now()})
        .eq("id", row_id)
        .eq("run_id", run_id)
        .eq("status", status)
        .execute()
        .data
    )


# ---------------------------------------------------------------------------- 일기 읽기(서버에서 다시 확인)
def load_topic_diaries(user_id: str, topic: str) -> list[constellation_llm.DiaryInput]:
    """이 사용자의 이 주제 일기(오래된 순). 주제는 /stars 와 같은 기준: DB diaries.topic, 비어 있으면 예전 AI 저장소 보충."""
    rows: list[dict] | None = None
    if topic_column_ready():
        try:
            rows = (
                supabase.table("diaries").select("id, content, created_at, topic").eq("user_id", user_id).execute().data
            )
        except Exception as exc:
            if not is_missing_column(exc, "topic"):
                raise
            mark_topic_column_missing()
    if rows is None:
        rows = supabase.table("diaries").select("id, content, created_at").eq("user_id", user_id).execute().data
    topics = {str(r["id"]): (r.get("topic") if r.get("topic") in _TOPICS else None) for r in rows}
    missing = [i for i, t in topics.items() if t is None]
    if missing and settings.topic_ai_fallback:
        legacy = ai_client.diary_topics(user_id, missing, _TOPICS) or {}
        for i in missing:
            topics[i] = legacy.get(i)
    mine = [r for r in rows if topics.get(str(r["id"])) == topic]
    positions: dict[str, tuple[float, float, float]] = {}
    if mine:
        try:
            stars = (
                supabase.table("stars")
                .select("diary_id, x, y, z")
                .in_("diary_id", [str(r["id"]) for r in mine])
                .execute()
                .data
            )
            positions = {str(s["diary_id"]): (float(s["x"]), float(s["y"]), float(s["z"])) for s in stars}
        except Exception as exc:  # 좌표는 대표 일기 고르기에만 쓰는 보조 정보 → 없어도 진행
            logger.warning("star positions unavailable for constellation analysis: %s", type(exc).__name__)
    out = [
        constellation_llm.DiaryInput(
            id=str(r["id"]), created_at=str(r.get("created_at") or ""), content=r.get("content") or "",
            pos=positions.get(str(r["id"])),
        )
        for r in mine
    ]
    out.sort(key=lambda d: (d.created_at, d.id))
    return out


# ---------------------------------------------------------------------------- API
@router.get("/personal", response_model=list[PersonalConstellation])
def list_personal(user_id: str = Depends(get_current_user_id)):
    rows = supabase.table(TABLE).select("*").eq("user_id", user_id).execute().data
    return [_public(r) for r in rows if r.get("topic") in _TOPICS]


@router.post("/personal", response_model=PersonalConstellation, status_code=202)
def create_personal(
    body: PersonalConstellationCreate,
    background: BackgroundTasks,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    topic = body.topic
    response.status_code = 202  # 만드는 중(pending). 이미 완성된 별자리를 돌려줄 때만 200
    row = _get(user_id, topic)
    if row and row.get("status") == "ready":
        response.status_code = 200  # 이미 만든 별자리 → LLM 호출 없이 그대로
        return _public(row)
    if row and row.get("status") == "pending" and not _is_stale(row):
        return _public(row)  # 만드는 중(중복 클릭·재시도) → 새 호출 없음

    if not body.consent:
        raise HTTPException(400, {"code": "consent_required", "message": "일기 내용 전송에 동의해야 만들 수 있어요."})
    if not llm_client.is_configured():
        raise HTTPException(503, {"code": "not_configured", "message": USER_MESSAGES["not_configured"]})

    threshold = settings.personal_constellation_threshold
    diaries = load_topic_diaries(user_id, topic)
    if len(diaries) < threshold:
        raise HTTPException(
            409,
            {"code": "not_enough", "message": f"{threshold - len(diaries)}개의 기억을 더 기록하면 만들 수 있어요.",
             "count": len(diaries), "required": threshold},
        )

    run_id = str(uuid.uuid4())
    now = _now()
    claimed: dict | None = None
    if row is None:
        try:
            claimed = (
                supabase.table(TABLE)
                .insert({
                    "user_id": user_id, "topic": topic, "status": "pending", "stage": "queued", "run_id": run_id,
                    "attempts": 1, "required_planets": threshold, "consent_at": now, "updated_at": now,
                    "generation_version": constellation_llm.GENERATION_VERSION,
                })
                .execute()
                .data[0]
            )
        except APIError as exc:
            if str(getattr(exc, "code", "")) != "23505":
                raise
            row = _get(user_id, topic)  # 동시에 누른 다른 요청이 먼저 만들었다
            if row is None:
                raise
            if row.get("status") == "ready":
                response.status_code = 200
            return _public(row)
    else:
        if int(row.get("attempts") or 0) >= settings.personal_constellation_max_attempts:
            raise HTTPException(
                429, {"code": "attempts_exhausted", "message": "다시 시도할 수 있는 횟수를 모두 사용했어요."}
            )
        got = _cas(row["id"], row["run_id"], row["status"], {
            "status": "pending", "stage": "queued", "run_id": run_id,
            "attempts": int(row.get("attempts") or 0) + 1, "error_code": None, "error_message": None,
            "consent_at": now, "required_planets": threshold,
        })
        if not got:
            return _public(_get(user_id, topic) or row)  # 다른 요청이 먼저 다시 시작했다
        claimed = got[0]

    background.add_task(run_generation, user_id, topic, run_id, claimed["id"], diaries)
    return _public(claimed)


# ---------------------------------------------------------------------------- 백그라운드 생성
def run_generation(user_id: str, topic: str, run_id: str, row_id: str, diaries: list) -> None:
    tag = _tag(user_id, topic)
    usage = llm_client.LLMUsage()

    def stage(name: str) -> None:
        try:
            _cas(row_id, run_id, "pending", {"stage": name})
        except Exception as exc:  # 단계 표시 실패로 생성을 멈추지 않는다
            logger.warning("constellation stage update failed: %s tag=%s", type(exc).__name__, tag)

    threshold = settings.personal_constellation_threshold
    try:
        result = constellation_llm.generate(topic, diaries, usage=usage, on_stage=stage, log_tag=tag)
        members = [d.id for d in diaries[:threshold]]
        saved = _cas(row_id, run_id, "pending", {
            "status": "ready", "stage": "done",
            "name": result.name, "concept": result.concept, "shape_label": result.shape_label,
            "description": result.description, "reason": result.reason,
            "keywords": result.keywords, "analysis": result.analysis | {"stats": result.stats},
            "points": result.points, "connections": result.connections, "planet_ids": members,
            "required_planets": threshold, "source_diary_count": len(diaries),
            "shape_source": result.shape_source, "model": settings.llm_model, "usage": usage.as_dict(),
            "generation_version": constellation_llm.GENERATION_VERSION, "completed_at": _now(),
        })
        logger.info(
            "personal constellation ready source=%s calls=%d in=%d out=%d cost_usd=%s saved=%s tag=%s",
            result.shape_source, usage.calls, usage.input_tokens, usage.output_tokens, usage.cost_usd(), bool(saved), tag,
        )
    except (llm_client.LLMError, constellation_llm.GenerationError) as exc:
        _fail(row_id, run_id, exc.code, usage, tag)
    except Exception as exc:
        logger.error("personal constellation internal error: %s tag=%s", type(exc).__name__, tag)
        _fail(row_id, run_id, "internal", usage, tag)


def _fail(row_id: str, run_id: str, code: str, usage: llm_client.LLMUsage, tag: str) -> None:
    logger.info("personal constellation failed code=%s calls=%d tag=%s", code, usage.calls, tag)
    try:
        _cas(row_id, run_id, "pending", {
            "status": "failed", "stage": "failed", "error_code": code,
            "error_message": USER_MESSAGES.get(code, USER_MESSAGES["internal"]), "usage": usage.as_dict(),
        })
    except Exception as exc:
        logger.error("personal constellation failure not saved: %s tag=%s", type(exc).__name__, tag)
