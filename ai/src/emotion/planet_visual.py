"""감정 확률(44개) → 행성 외형 (v0.2 시안). 모델 출력은 바꾸지 않고 '어떻게 보여 줄지'만 정한다.

그룹 정의(어떤 라벨이 어느 그룹인지, 그룹 쾌·각성)는 configs/planet_mapping.json,
색·외형 규칙은 configs/planet_visual.json에 있다. 근거와 수치: ai/reports/planet_visual_v02_ko.md

계산 과정 (모델 출력 → 그룹 점수 → 행성 색)
 1. 모델 출력: 44개 라벨 확률 p (sigmoid, 라벨마다 독립). 라벨별 판정 기준값 t는 validation에서 정한 값
    (체크포인트의 thresholds.json "per_label"). p ≥ t 이면 모델이 그 감정을 '판정'한 것이다.
 2. 그룹 점수
    - 강도 A[g]  = 그룹 안 라벨 확률의 최댓값            → 주 그룹(대표색)을 고른다
    - 여유 M[g]  = 그룹 안 라벨의 (logit p − logit t) 최댓값 → 보조 감정 순서를 정한다
    - 판정[g]    = 그룹 안 라벨이 하나라도 p ≥ t
 3. 상태(state)
    - none  : '없음'을 판정했고 p(없음) ≥ 주 그룹 강도  → 회청색 기본 행성 (부정 감정으로 취급하지 않음)
    - muted : 주 그룹 강도 < 0.5                     → 대표색을 회청색 쪽으로 70% 섞은 옅은 행성
              주 그룹을 판정하지 못함(모든 감정이 기준값 미만) → 감정 색 없이 회청색
    - soft  : 강도 0.5 ~ 0.7                        → 채도 70%, 보조 감정 1개까지
    - clear : 강도 ≥ 0.7                            → 대표색 그대로
 4. 대표색(base_color) = 주 그룹 색 (상태에 따라 회청색과 섞음).
    보조 감정(accents) = 판정을 통과한 다른 그룹만.
      ① 여유 M 순서로 2자리(soft는 1자리), 면적 최대 26%·12% (프론트에서 대표색 계열 표면 위의 가는 층으로 그림)
      ② 남은 판정 그룹 중 KOTE train에서 가장 드문 그룹 1자리, 면적 최대 7%
         → 드문 감정이 판정됐는데 흔한 감정에 밀려 사라지는 것을 막는다.
    판정을 통과하지 못한 감정은 보조색으로도 쓰지 않는다(시각화 단계에서 감정을 만들어 내지 않음).
 5. 장식: 고리 = 뚜렷한 복합 감정(clear + 보조 2개 + 두 번째도 강함), 대기광 = 밝은 감정(clear + glow 높음).
    무늬 종류 = 주 그룹 각성. 크기는 여기서 정하지 않는다(크기 = 일기 분량, 프론트에서 계산).

예전 v0.1(planet_mapping.compute_planet)은 보조색을 '확률 2위 그룹'으로 골라, 판정 기준값이 낮은 드문 감정
(지침·무기력, 부끄러움·자책 등)이 판정되어도 흔한 감정에 밀려 거의 표시되지 않았다
(validation: 판정된 부끄러움·자책 중 주색·보조색으로 보인 비율 0.4%).
"""
from __future__ import annotations

import colorsys
import json
from pathlib import Path

import numpy as np

EPS = 1e-6


def load_visual(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _rgb_to_hex(rgb) -> str:
    return "#" + "".join(f"{round(min(max(c, 0), 1) * 255):02X}" for c in rgb)


def _mix(a: str, b: str, t: float) -> str:
    """a와 b를 섞는다. t=0이면 a, t=1이면 b."""
    ra, rb = _hex_to_rgb(a), _hex_to_rgb(b)
    return _rgb_to_hex([x + (y - x) * t for x, y in zip(ra, rb)])


def _shade(hex_color: str, index: int, n: int, cfg: dict) -> str:
    """그룹 안 라벨 순서(index)에 따라 색상·명도를 조금 옮긴 무늬색."""
    h, l, s = colorsys.rgb_to_hls(*_hex_to_rgb(hex_color))
    offset = index - (n - 1) / 2
    h = (h + offset * cfg["hue_step_deg"] / 360) % 1.0
    l = min(max(l + (cfg["lightness_step"] if index % 2 else -cfg["lightness_step"]), 0.15), 0.85)
    return _rgb_to_hex(colorsys.hls_to_rgb(h, l, s))


def _logit(p):
    p = np.clip(np.asarray(p, dtype=np.float64), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def compute_visual(probs, label_names: list[str], mapping: dict, visual: dict, thresholds) -> dict:
    """일기 1개의 44개 라벨 확률 → 행성 외형(JSON 직렬화 가능한 dict)."""
    p = np.asarray(probs, dtype=np.float64)
    t = np.asarray(thresholds, dtype=np.float64)
    margin = _logit(p) - _logit(t)
    idx = {n: i for i, n in enumerate(label_names)}
    groups = []
    for g in mapping["groups"]:
        ix = [idx[lab] for lab in g["labels"]]
        k = int(np.argmax(p[ix]))
        groups.append({"id": g["id"], "name": g["name"], "labels": g["labels"], "top_index": k,
                       "top_label": g["labels"][k], "score": float(p[ix].max()), "margin": float(margin[ix].max()),
                       "passed": bool((p[ix] >= t[ix]).any()), "valence": g["valence"], "arousal": g["arousal"],
                       "color": visual["colors"][g["id"]]["hex"]})
    order = sorted(range(len(groups)), key=lambda k: -groups[k]["score"])
    prim = groups[order[0]]
    s = prim["score"]
    i_none = idx[mapping["neutral"]["label"]]
    p_none = float(p[i_none])
    none_passed = bool(p_none >= t[i_none])
    conf = visual["confidence"]
    none_hex = visual["none_color"]["hex"]

    if none_passed and p_none >= s:
        state = "none"
    elif not prim["passed"] or s < conf["soft_min"]:
        state = "muted"
    elif s < conf["clear_min"]:
        state = "soft"
    else:
        state = "clear"
    fade = 1.0 - visual["saturation"][state]  # 회청색 쪽으로 섞는 비율
    if state == "muted" and not prim["passed"]:
        fade = 1.0  # 어떤 감정도 판정하지 못함 → 감정 색 없이 회청색(근거 없는 색을 칠하지 않는다)

    # 보조 감정: 판정을 통과한 다른 그룹. ① 기준값 대비 여유가 큰 순서, ② 남은 것 중 가장 드문 그룹(작은 면적)
    acfg = visual["accent"]
    prevalence = visual["group_train_prevalence"]["values"]
    accents = []

    def _accent(g, w, slot):
        ratio = min(1.0, g["score"] / s)
        if slot == "rare":
            ratio = max(ratio, 0.5)  # 너무 작아 안 보이지 않도록 최소 절반 크기(3.5%)
        return {"group": g["id"], "name": g["name"], "label": g["top_label"], "score": round(g["score"], 4),
                "color": _mix(g["color"], none_hex, fade), "weight": round(w * ratio, 3), "slot": slot}

    if state in ("clear", "soft"):
        cands = sorted((g for g in groups if g is not prim and g["passed"]), key=lambda g: -g["margin"])
        n_main = 2 if state == "clear" else 1
        for g, w in zip(cands[:n_main], acfg["max_weights"]):
            accents.append(_accent(g, w, "main"))
        rest = sorted(cands[n_main:], key=lambda g: prevalence[g["id"]])
        if rest:
            accents.append(_accent(rest[0], acfg["rare_weight"], "rare"))
    elif state == "none" and prim["passed"]:
        # '없음'이 우세해도 모델이 판정한 감정이 있으면 옅은 무늬로만 남긴다
        accents.append({"group": prim["id"], "name": prim["name"], "label": prim["top_label"], "score": round(s, 4),
                        "color": _mix(prim["color"], none_hex, 0.4), "weight": round(0.15 * min(1.0, s / p_none), 3),
                        "slot": "main"})

    shown = ([prim] if state != "none" else []) + [g for g in groups if g["id"] in {a["group"] for a in accents} and g is not prim]
    w = np.array([1.0 if g is prim else next(a["weight"] for a in accents if a["group"] == g["id"]) for g in shown]) if shown else np.array([])
    valence = float((w * [g["valence"] for g in shown]).sum() / w.sum()) if shown else 0.0
    arousal = float((w * [g["arousal"] for g in shown]).sum() / w.sum()) if shown else 0.0
    glow = ((valence + 1) / 2) * (s if state != "none" else 0.0)
    if state == "muted":
        glow *= 0.5

    if state == "none":
        base, tone = none_hex, _shade(none_hex, 0, 2, visual["label_shade"])
    else:
        base = _mix(prim["color"], none_hex, fade)
        tone = _mix(_shade(prim["color"], prim["top_index"], len(prim["labels"]), visual["label_shade"]), none_hex, fade)

    pa = visual["pattern_by_arousal"]
    if state in ("none", "muted"):
        pattern = "mist"
    else:
        a = prim["arousal"]
        pattern = "storm" if a >= pa["storm_min"] else "bands" if a >= pa["bands_min"] else "soft"

    main = [a for a in accents if a["slot"] == "main"]
    ring_visible = (state == "clear" and len(main) == 2
                    and main[1]["score"] >= visual["ring"]["min_second_accent_score"])
    atmosphere = state == "clear" and glow >= visual["atmosphere"]["min_glow"]
    return {
        "version": visual["version"],
        "state": state,
        "primary": {"group": prim["id"], "name": prim["name"], "label": prim["top_label"], "score": round(s, 4),
                    "passed": prim["passed"]},
        "none_prob": round(p_none, 4),
        "base_color": base,
        "tone_color": tone,
        "accents": accents,
        "pattern": pattern,
        "turbulence": round(arousal, 3),
        "glow": round(float(glow), 3),
        "ring": {"visible": ring_visible, "color": main[1]["color"] if ring_visible else None},
        "atmosphere": {"visible": atmosphere, "color": _mix(base, "#FFFFFF", 0.35) if atmosphere else None},
        "valence": round(valence, 3),
    }
