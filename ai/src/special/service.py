"""AI 서비스용: 감정 파이프라인 결과(기존 그대로) + 특수 행성 선택 → 행성 설계(design).

기존 analyze 결과(emotion·planet·visual·star)는 한 글자도 바꾸지 않고 그대로 돌려주고, design만 더한다.
"""
from __future__ import annotations

from pathlib import Path

from src.emotion.pipeline import DiaryEmotionPipeline

from .design import build_design, group_states
from .selector import SpecialPlanetSelector, load_special


class PlanetDesignService:
    def __init__(self, ai_root: Path, pipeline: DiaryEmotionPipeline, encoder=None):
        self.cfg = load_special(Path(ai_root) / "configs" / "special_planet.json")
        self.pipeline = pipeline
        self.selector = SpecialPlanetSelector(self.cfg, pipeline.labels, encoder=encoder)

    @property
    def topic_ids(self) -> set[str]:
        return set(self.cfg["user_topic"]["topics"])

    def status(self) -> dict:
        return {"version": self.selector.version, "enabled": self.selector.enabled,
                "disabled_reason": self.selector.disabled_reason, "threshold": self.cfg["threshold"]}

    def analyze_with_design(self, texts: list[str], topics: list[str | None] | None = None) -> list[dict]:
        p = self.pipeline
        probs = p.predict_proba(texts)
        base = p.analyze(texts)  # 기존 결과(감정·행성 외형·별 색·밝기)
        groups = [group_states(row, p.labels, p.mapping, p.thresholds) for row in probs]
        cut = [t[: p.cfg["max_text_chars"]] for t in texts]
        sels = self.selector.select_batch(cut, probs, p.thresholds, topics, groups)
        for b, s in zip(base, sels):
            b["design"] = build_design(b["visual"], s, self.cfg)
        return base
