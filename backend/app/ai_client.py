"""AI 추론 서비스(ai/service) 호출.

- analyze_diary: 일기 내용 → 별의 색·밝기 (1단계, 감정)
- place_diary: 일기 → 별의 3D 좌표 (2단계, 의미가 비슷한 기억 근처에 배치)
- update_diary_layout / forget_diary: 일기 수정·삭제를 AI 서비스 저장소에 알림 (좌표는 바뀌지 않음)
- related_diaries: 관련 기억 목록
- planet_visuals: 별 목록 조회 때 행성 외형(대표색·보조색·무늬·고리) 계산 (저장하지 않음)
- planet_designs: 행성 외형 + AI 자동 특수 행성 설계. [2026-11-12] 특수 효과를 사용자가 직접 고르게 바뀌어
  별 목록에서는 더 이상 부르지 않는다(다시 켤 때를 위해 남겨 둠). 별 목록은 planet_visuals만 쓴다.

AI 서비스 주소가 설정되지 않았거나 호출에 실패하면 None을 돌려주고, 호출한 쪽은 기존 방식
(무작위 위치, stars 테이블 기본 색·밝기)으로 처리한다. 일기 저장은 AI 서비스 상태와 관계없이 항상 성공해야 한다.
"""
import hashlib
import logging
import math
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
BRIGHTNESS_RANGE = (0.0, 3.0)


def _post(path: str, payload: dict) -> httpx.Response:
    headers = {"X-AI-Token": settings.ai_service_token} if settings.ai_service_token else {}
    response = httpx.post(
        f"{settings.ai_service_url.rstrip('/')}{path}",
        json=payload,
        headers=headers,
        timeout=settings.ai_service_timeout,
    )
    response.raise_for_status()
    return response


def analyze_diary(content: str) -> dict | None:
    """{"color": "#RRGGBB", "brightness": float} 또는 None."""
    if not settings.ai_service_url:
        return None
    try:
        star = _post("/analyze", {"text": content}).json()["star"]
        color = str(star["color"])
        brightness = float(star["brightness"])
    except Exception as exc:  # 네트워크 오류, 시간 초과, 응답 형식 오류 모두 기본값으로 처리
        logger.warning("AI 분석 실패, 기본 별 속성을 사용합니다: %s", exc)
        return None
    if not _HEX_COLOR.match(color):
        logger.warning("AI 응답의 색 형식이 올바르지 않습니다: %r", color)
        return None
    low, high = BRIGHTNESS_RANGE
    return {"color": color.upper(), "brightness": min(max(brightness, low), high)}


_VISUAL_CACHE: dict[str, dict] = {}
_VISUAL_CACHE_MAX = 2000
# Keep interactive universe requests small; a 64-diary CPU inference can exceed
# the service timeout and make every older planet fall back to gray at once.
_VISUAL_BATCH = 8


def planet_visuals(contents: list[str]) -> list[dict | None] | None:
    """일기 내용 목록 → 행성 외형(감정 대표색·보조색·무늬·고리 등) 목록. AI 서비스가 없거나 실패하면 None.

    DB 스키마를 바꾸지 않기 위해 저장하지 않고 조회할 때 계산한다. 같은 내용은 이 프로세스 메모리에
    캐시한다(키 = 내용 해시, 서버를 다시 띄우면 비워짐). 크기는 여기서 정하지 않는다(프론트가 글자 수로 계산).
    """
    if not settings.ai_service_url or not contents:
        return None
    keys = [hashlib.sha256(c.encode("utf-8")).hexdigest() for c in contents]
    missing = sorted({(k, c) for k, c in zip(keys, contents) if k not in _VISUAL_CACHE})
    for i in range(0, len(missing), _VISUAL_BATCH):
        chunk = missing[i:i + _VISUAL_BATCH]
        try:
            results = _post("/analyze/batch", {"texts": [c for _, c in chunk]}).json()["results"]
            if len(results) != len(chunk):
                raise ValueError("AI result count mismatch")
            for (k, _), r in zip(chunk, results):
                visual = r.get("visual") if isinstance(r, dict) else None
                if not isinstance(visual, dict) or visual.get("state") not in {"none", "muted", "soft", "clear"}:
                    continue  # Missing analysis must be retried, never cached as a result.
                if len(_VISUAL_CACHE) >= _VISUAL_CACHE_MAX:
                    _VISUAL_CACHE.pop(next(iter(_VISUAL_CACHE)))
                _VISUAL_CACHE[k] = visual
        except Exception as exc:
            # One failed batch must not erase existing or other successful visuals.
            logger.warning("행성 외형 일부 조회 실패 (%s), 다음 조회에서 다시 시도합니다", type(exc).__name__)
    return [_VISUAL_CACHE.get(k) for k in keys]


_DESIGN_CACHE: dict[tuple[str, str, str], dict] = {}


def planet_designs(user_id: str, items: list[tuple[str, str]]) -> list[dict | None] | None:
    """[(diary_id, 내용)] → [{"visual", "design"}] (행성 외형 + 행성 설계). AI 서비스가 없거나 실패하면 None.

    주제는 AI 서비스가 일기를 처음 받을 때(/layout/add) 저장한 값을 쓴다. 저장하지 않고 조회할 때 계산하며,
    (사용자, 일기, 내용 해시)로 이 프로세스 메모리에 캐시한다.
    """
    if not settings.ai_service_url or not items:
        return None
    keys = [(user_id, did, hashlib.sha256(c.encode("utf-8")).hexdigest()) for did, c in items]
    missing = [(k, did, c) for k, (did, c) in zip(keys, items) if k not in _DESIGN_CACHE]
    try:
        for i in range(0, len(missing), _VISUAL_BATCH):
            chunk = missing[i:i + _VISUAL_BATCH]
            payload = {"user_id": user_id, "items": [{"diary_id": did, "text": c} for _, did, c in chunk]}
            results = _post("/design/batch", payload).json()["results"]
            for (k, _, _), r in zip(chunk, results):
                if len(_DESIGN_CACHE) >= _VISUAL_CACHE_MAX:
                    _DESIGN_CACHE.pop(next(iter(_DESIGN_CACHE)))
                _DESIGN_CACHE[k] = {"visual": r["visual"], "design": r["design"]}
    except Exception as exc:
        logger.warning("행성 설계 조회 실패: %s", exc)
        return None
    return [_DESIGN_CACHE.get(k) for k in keys]


def place_diary(user_id: str, diary_id: str, content: str, topic: str | None = None) -> dict | None:
    """{"x", "y", "z"} 또는 None. 같은 diary_id를 다시 보내면 AI 서비스가 저장된 좌표를 그대로 돌려준다.
    topic(사용자가 고른 주제, 선택)은 AI 서비스가 특수 행성 선택용으로 저장한다. 좌표에는 쓰지 않는다."""
    if not settings.ai_service_url:
        return None
    payload = {"user_id": user_id, "diary_id": diary_id, "text": content}
    if topic:
        payload["topic"] = topic
    try:
        star = _post("/layout/add", payload).json()["star"]
        xyz = {k: float(star[k]) for k in ("x", "y", "z")}
    except Exception as exc:
        logger.warning("AI 좌표 생성 실패, 무작위 위치를 사용합니다: %s", exc)
        return None
    if not all(math.isfinite(v) for v in xyz.values()):
        logger.warning("AI 응답 좌표가 올바르지 않습니다: %r", xyz)
        return None
    return xyz


def update_diary_layout(user_id: str, diary_id: str, content: str) -> None:
    """수정된 일기 내용을 관련 기억 검색에 반영한다. 별 위치는 바뀌지 않는다. 실패해도 무시한다."""
    if not settings.ai_service_url:
        return
    try:
        _post("/layout/update", {"user_id": user_id, "diary_id": diary_id, "text": content})
    except Exception as exc:
        logger.warning("AI 저장소 갱신 실패(무시): %s", exc)


def forget_diary(user_id: str, diary_id: str) -> None:
    """삭제된 일기를 AI 서비스 저장소에서 뺀다. 실패해도 무시한다."""
    if not settings.ai_service_url:
        return
    try:
        _post("/layout/remove", {"user_id": user_id, "diary_id": diary_id})
    except Exception as exc:
        logger.warning("AI 저장소에서 일기 삭제 실패(무시): %s", exc)


_TOPIC_BATCH = 2000


def diary_topics(user_id: str, diary_ids: list[str], allowed: set[str]) -> dict[str, str] | None:
    """[ADDED 2026-11-12] 별자리용: {diary_id: 사용자가 고른 주제}. 주제를 고르지 않은 일기는 빠진다.
    주제는 DB가 아니라 AI 서비스에 저장돼 있어(/layout/add) 읽기만 한다. AI 서비스가 없거나 실패하면 None.
    allowed 에 없는 값(예전·잘못된 값)은 버린다."""
    if not settings.ai_service_url or not diary_ids:
        return None
    out: dict[str, str] = {}
    try:
        for i in range(0, len(diary_ids), _TOPIC_BATCH):
            chunk = diary_ids[i:i + _TOPIC_BATCH]
            topics = _post("/topics/batch", {"user_id": user_id, "diary_ids": chunk}).json()["topics"]
            out.update({str(d): str(t) for d, t in topics.items() if str(t) in allowed})
    except Exception as exc:
        logger.warning("일기 주제 조회 실패(별자리 없이 진행): %s", exc)
        return None
    return out


def set_diary_topic(user_id: str, diary_id: str, topic: str | None) -> None:
    """[ADDED 2026-11-13] 일기 수정으로 바뀐 주제를 AI 서비스 저장소에도 맞춘다(null = 주제 없음).
    DB(diaries.topic)가 원본이고, 이 저장소는 DB에 주제가 없을 때만 보충용으로 읽는다. 실패해도 무시한다."""
    if not settings.ai_service_url:
        return
    try:
        _post("/topics/set", {"user_id": user_id, "diary_id": diary_id, "topic": topic})
    except Exception as exc:
        logger.warning("AI 저장소 주제 갱신 실패(무시): %s", exc)


def related_diaries(user_id: str, diary_id: str) -> list[dict] | None:
    """[{"diary_id", "similarity"}] (유사도 높은 순, 없으면 빈 목록) 또는 None(AI 서비스 없음·실패·미등록 일기)."""
    if not settings.ai_service_url:
        return None
    try:
        items = _post("/layout/related", {"user_id": user_id, "diary_id": diary_id}).json()["related"]
        return [{"diary_id": str(x["diary_id"]), "similarity": float(x["similarity"])} for x in items]
    except Exception as exc:
        logger.warning("관련 기억 조회 실패: %s", exc)
        return None
