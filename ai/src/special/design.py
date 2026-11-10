"""Planet Design Mapper: 기존 감정 행성 외형(visual, v0.2) + 특수 행성 선택 결과 → 렌더러용 행성 설계.

기존 값은 다시 계산하거나 바꾸지 않고 그대로 옮겨 담는다(색·무늬 = visual, 크기 = 백엔드가 일기 분량으로 정한 값).
특수 행성 관련 값은 specialEffects·effectParameters·selection에만 둔다.

출력 (JSON)
    {
      "version": "design:0.1",
      "planetType": "normal" | "special",
      "specialType": null | "ocean" | "cloud" | "crystal" | "nebula" | "lava",
      "emotionCore": {"primaryEmotion", "primaryEmotionName", "state", "colors", "pattern", "size"},
      "specialEffects": {"waterAura", "cloudLayer", "crystals", "nebula", "lavaEnergy"},
      "effectParameters": null | {"intensity", "speed"},
      "selection": {"score", "threshold", "reason", "topic", "candidate", "scores", ...}
    }
"""
from __future__ import annotations

import numpy as np

DESIGN_VERSION = "design:0.1"


def group_states(probs, label_names: list[str], mapping: dict, thresholds) -> list[dict]:
    """그룹별 점수(그룹 안 라벨 확률 최댓값)·판정 여부·쾌불쾌. planet_visual.compute_visual과 같은 정의."""
    p = np.asarray(probs, np.float64)
    t = np.asarray(thresholds, np.float64)
    idx = {n: i for i, n in enumerate(label_names)}
    out = []
    for g in mapping["groups"]:
        ix = [idx[lab] for lab in g["labels"]]
        out.append({"id": g["id"], "name": g["name"], "score": float(p[ix].max()),
                    "passed": bool((p[ix] >= t[ix]).any()), "valence": g["valence"]})
    return out


def build_design(visual: dict, selection: dict, cfg: dict, size: float | None = None) -> dict:
    special = bool(selection.get("special"))
    stype = selection.get("type") if special else None
    flags = {f: False for f in cfg["effect_flags"]}
    params = None
    if special:
        flags.update(cfg["types"][stype]["effect"])
        lo, hi = cfg["effect_parameters"]["intensity_range"]
        tau = cfg["threshold"]
        k = min(max((selection["score"] - tau) / max(1 - tau, 1e-6), 0.0), 1.0)
        params = {"intensity": round(lo + (hi - lo) * k, 3), "speed": cfg["effect_parameters"]["speed"]}
    colors = [visual["base_color"], visual["tone_color"]] + [a["color"] for a in visual.get("accents", [])]
    return {
        "version": DESIGN_VERSION,
        "planetType": "special" if special else "normal",
        "specialType": stype,
        "emotionCore": {
            "primaryEmotion": visual["primary"]["group"] if visual["state"] != "none" else "none",
            "primaryEmotionName": visual["primary"]["name"] if visual["state"] != "none" else "없음",
            "state": visual["state"],
            "colors": colors,
            "pattern": visual["pattern"],
            "size": size,
        },
        "specialEffects": flags,
        "effectParameters": params,
        "selection": {
            "score": selection.get("score"),
            "threshold": selection.get("threshold"),
            "margin": selection.get("margin"),
            "candidate": selection.get("candidate"),
            "candidateName": cfg["types"][selection["candidate"]]["name_ko"] if selection.get("candidate") else None,
            "typeName": cfg["types"][stype]["name_ko"] if stype else None,
            "topic": selection.get("topic"),
            "topicName": cfg["user_topic"]["topics"][selection["topic"]]["name"] if selection.get("topic") else None,
            "reason": selection.get("reason"),
            "checks": selection.get("checks"),
            "scores": selection.get("scores"),
            "version": selection.get("version"),
        },
    }
