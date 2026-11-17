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
