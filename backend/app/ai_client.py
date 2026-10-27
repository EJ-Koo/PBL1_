"""AI 추론 서비스(ai/service) 호출.

- analyze_diary: 일기 내용 → 별의 색·밝기 (1단계, 감정)
- place_diary: 일기 → 별의 3D 좌표 (2단계, 의미가 비슷한 기억 근처에 배치)
- update_diary_layout / forget_diary: 일기 수정·삭제를 AI 서비스 저장소에 알림 (좌표는 바뀌지 않음)
- related_diaries: 관련 기억 목록

AI 서비스 주소가 설정되지 않았거나 호출에 실패하면 None을 돌려주고, 호출한 쪽은 기존 방식
(무작위 위치, stars 테이블 기본 색·밝기)으로 처리한다. 일기 저장은 AI 서비스 상태와 관계없이 항상 성공해야 한다.
"""
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


def place_diary(user_id: str, diary_id: str, content: str) -> dict | None:
    """{"x", "y", "z"} 또는 None. 같은 diary_id를 다시 보내면 AI 서비스가 저장된 좌표를 그대로 돌려준다."""
    if not settings.ai_service_url:
        return None
    try:
        star = _post("/layout/add", {"user_id": user_id, "diary_id": diary_id, "text": content}).json()["star"]
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
