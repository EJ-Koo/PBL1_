from typing import Any

from pydantic import BaseModel


class Star(BaseModel):
    id: str
    diary_id: str
    x: float
    y: float
    z: float
    color: str
    size: float
    brightness: float
    # AI 감정 분석으로 정한 행성 외형(대표색·보조색·무늬·고리 등). AI 서비스가 없으면 None.
    # 형식: ai/src/emotion/planet_visual.py (compute_visual)
    planet: dict[str, Any] | None = None
    # [MODIFIED 2026-11-12] 예전 AI 자동 특수 행성 설계(ai/src/special/design.py). 더 이상 채우지 않는다(항상 None).
    # 예전 앱이 이 필드를 읽어도 오류가 나지 않게 남겨 둔다.
    design: dict[str, Any] | None = None
    # [ADDED 2026-11-12] 사용자가 이 행성에 적용한 특수 효과(ocean·cloud·crystal·nebula·lava). 없으면 None(일반 행성).
    effect: str | None = None
    effect_item_id: str | None = None
