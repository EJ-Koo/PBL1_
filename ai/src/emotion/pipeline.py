"""일기 텍스트 → 감정 분석 → 후처리 → 행성 매핑을 한 번에 수행하는 서비스용 파이프라인.

결과(dict, JSON 직렬화 가능)
    {
      "emotion": {"top_labels", "dominant_valence", "valence", "groups"},   # 후처리(postprocess.summarize)
      "planet": {...},                                                     # v0.1 행성 파라미터(planet_mapping, 기록용)
      "visual": {...},                                                     # v0.2 행성 외형(planet_visual) → 프론트 렌더링
      "star": {"color": "#RRGGBB", "brightness": float}                    # stars 테이블에 저장할 값 (visual 기준)
    }
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from src.data.labels import load_label_names
from src.data.paths import load_json
from src.emotion.planet_mapping import compute_planet, load_mapping
from src.emotion.planet_visual import compute_visual, load_visual
from src.emotion.postprocess import apply_postprocess, hierarchy, load_postprocess, summarize
from src.emotion.predict import EmotionPredictor


class DiaryEmotionPipeline:
    def __init__(self, ai_root: Path, service_cfg: dict | None = None, device: str | None = None):
        self.ai_root = Path(ai_root)
        cfg_dir = self.ai_root / "configs"
        self.cfg = service_cfg or load_json(cfg_dir / "service.json")
        self.labels = load_label_names(cfg_dir / "kote_labels.json")
        self.mapping = load_mapping(cfg_dir / "planet_mapping.json")
        self.visual = load_visual(cfg_dir / "planet_visual.json")
        self.pp_cfg = load_postprocess(cfg_dir / "emotion_postprocess.json")
        self.H = hierarchy(self.pp_cfg, self.labels)
        self.predictors = []
        for m in self.cfg["models"]:
            ckpt = self.ai_root / m["checkpoint_dir"]
            if not (ckpt / "config.json").exists():
                raise FileNotFoundError(f"모델 체크포인트가 없습니다: {ckpt}")
            p = EmotionPredictor(ckpt, device=device)
            if p.labels != self.labels:
                raise ValueError(f"{ckpt}의 라벨 순서가 kote_labels.json과 다릅니다.")
            self.predictors.append(p)
        # 라벨별 판정 기준값(validation에서 정함). 행성 외형에서 '모델이 판정한 감정'을 가르는 데 쓴다.
        # 앙상블이면 평균을 쓰지만, 앙상블 확률에 맞춘 기준값은 따로 정해야 한다(03·06 노트북 방식).
        self.thresholds = np.mean([p.thresholds for p in self.predictors], 0)
        lo, hi = self.cfg["star"]["brightness_range"]
        self._brightness = lambda glow: round(lo + (hi - lo) * float(glow), 4)

    @property
    def model_names(self) -> list[str]:
        return [m["name"] for m in self.cfg["models"]]

    def predict_proba(self, texts: list[str]) -> np.ndarray:
        """모델(여러 개면 평균)의 44개 감정 확률 → 후처리(설정에 따라 사전확률 보정)."""
        texts = [t[: self.cfg["max_text_chars"]] for t in texts]
        probs = np.mean([p.predict_proba(texts) for p in self.predictors], 0)
        return apply_postprocess(probs, self.pp_cfg, self.H)

    def analyze(self, texts: list[str]) -> list[dict]:
        out = []
        for p in self.predict_proba(texts):
            planet = compute_planet(p, self.labels, self.mapping)
            visual = compute_visual(p, self.labels, self.mapping, self.visual, self.thresholds)
            out.append({
                "emotion": summarize(p, self.H, self.labels),
                "planet": planet["planet"] | {"summary": planet["summary"]},
                "visual": visual,
                "star": {"color": visual["base_color"], "brightness": self._brightness(visual["glow"])},
            })
        return out
