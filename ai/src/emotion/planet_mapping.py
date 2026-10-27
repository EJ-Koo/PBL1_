"""감정 확률(44개) → 행성 외형 파라미터 (설계 초안 v0.1).

입력: 감정 분류 모델의 라벨별 확률. 출력: 프론트(3D 렌더링)가 쓰는 JSON 직렬화 가능한 dict.
규칙과 수치는 ai/configs/planet_mapping.json에 있고, 이 파일은 계산만 한다.

외형 규칙 요약
- 기본색(base_color)  : 점수가 가장 높은 감정 그룹의 색
- 보조색(accent_color): 두 번째 그룹의 색. 섞이는 비율(accent_ratio)은 두 그룹 점수 비
- 채도(saturation)    : '없음' 확률이 높을수록 낮아짐(담담한 일기 → 옅은 행성)
- 빛남(glow)          : 쾌(valence)가 높고 감정이 강할수록 밝게
- 표면 소용돌이(turbulence)·띠 수(band_count): 각성(arousal)이 높을수록 거칠게
- 고리(ring)          : 활성 그룹이 3개 이상이면 '복합 감정' 고리 표시
- 크기(size_scale)    : 가장 강한 감정 점수에 비례
"""
from __future__ import annotations

import colorsys
import json
from pathlib import Path

import numpy as np


def load_mapping(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_mapping(cfg: dict, label_names: list[str]) -> None:
    """44개 라벨이 그룹(또는 neutral)에 정확히 한 번씩 배정되었는지 확인한다."""
    assigned = [lab for g in cfg["groups"] for lab in g["labels"]] + [cfg["neutral"]["label"]]
    dup = sorted({x for x in assigned if assigned.count(x) > 1})
    missing = sorted(set(label_names) - set(assigned))
    unknown = sorted(set(assigned) - set(label_names))
    if dup or missing or unknown:
        raise ValueError(f"매핑 오류 — 중복 {dup}, 누락 {missing}, 공식 목록에 없음 {unknown}")


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _rgb_to_hex(rgb) -> str:
    return "#" + "".join(f"{round(min(max(c, 0), 1) * 255):02X}" for c in rgb)


def _with_saturation(hex_color: str, factor: float) -> str:
    h, l, s = colorsys.rgb_to_hls(*_hex_to_rgb(hex_color))
    return _rgb_to_hex(colorsys.hls_to_rgb(h, l, s * factor))


def group_scores(probs: np.ndarray, label_names: list[str], cfg: dict) -> list[dict]:
    idx = {n: i for i, n in enumerate(label_names)}
    out = []
    for g in cfg["groups"]:
        p = np.array([probs[idx[lab]] for lab in g["labels"]])
        k = int(np.argmax(p))
        out.append({"id": g["id"], "name": g["name"], "score": float(p.max()),
                    "top_label": g["labels"][k], "color": g["color"],
                    "valence": g["valence"], "arousal": g["arousal"]})
    return sorted(out, key=lambda x: -x["score"])


def compute_planet(probs, label_names: list[str], cfg: dict, top_k: int = 5) -> dict:
    probs = np.asarray(probs, dtype=float)
    prm = cfg["params"]
    groups = group_scores(probs, label_names, cfg)
    active = [g for g in groups if g["score"] >= prm["active_min"]] or groups[:1]
    primary = groups[0]
    secondary = groups[1] if groups[1]["score"] >= prm["secondary_min"] else None

    w = np.array([g["score"] for g in active])
    w = w / w.sum()
    valence = float(sum(wi * g["valence"] for wi, g in zip(w, active)))
    arousal = float(sum(wi * g["arousal"] for wi, g in zip(w, active)))

    p_none = float(probs[label_names.index(cfg["neutral"]["label"])])
    saturation = max(prm["saturation_floor"], 1.0 - prm["neutral_desaturation"] * p_none)
    intensity = primary["score"]
    lo, hi = prm["size_scale_range"]
    ring_visible = len(active) >= prm["ring_min_active_groups"]
    ring_group = active[2] if len(active) >= 3 else None

    order = np.argsort(-probs)
    names = [g["name"] for g in ([primary] + ([secondary] if secondary else []))]
    return {
        "mapping_version": cfg["version"],
        "emotions": {
            "top": [{"label": label_names[j], "prob": round(float(probs[j]), 4)} for j in order[:top_k]],
            "none_prob": round(p_none, 4),
            "groups": [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in g.items()
                        if k in ("id", "name", "score", "top_label")} | {"active": g in active}
                       for g in groups],
        },
        "planet": {
            "base_color": _with_saturation(primary["color"], saturation),
            "accent_color": _with_saturation(secondary["color"], saturation) if secondary else None,
            "accent_ratio": round(secondary["score"] / (primary["score"] + secondary["score"]), 3) if secondary else 0.0,
            "saturation": round(saturation, 3),
            "glow": round(((valence + 1) / 2) * intensity, 3),
            "turbulence": round(arousal, 3),
            "band_count": 1 + int(round(4 * arousal)),
            "ring": {"visible": ring_visible,
                     "color": _with_saturation(ring_group["color"], saturation) if ring_group else None,
                     "opacity": round(min(1.0, (len(active) - 2) / 3), 3) if ring_visible else 0.0},
            "size_scale": round(lo + (hi - lo) * intensity, 3),
            "valence": round(valence, 3),
            "arousal": round(arousal, 3),
        },
        "summary": " + ".join(names) + (f" (복합 감정 {len(active)}개)" if ring_visible else ""),
    }
