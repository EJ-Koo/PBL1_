"""감정 확률 후처리: 계층적 묶기(44 → 10개 그룹 → 3개 정서)와 사전확률(prior) 보정.

모델은 다시 학습하지 않고, 모델이 낸 44개 라벨 확률에만 적용한다.

1) 계층적 묶기
   - 그룹 점수 = 그룹 안 라벨 확률의 최댓값 (행성 매핑과 같은 정의)
   - 정서 점수 = 정서(긍정/부정/중립) 안 그룹 점수의 최댓값
   최댓값으로 묶으므로 '부정 라벨이 26개로 긍정(17개)보다 많아서' 생기는 쏠림이 정서 단계에서 사라진다.

2) 사전확률 보정 (prior shift, Saerens et al. 2002의 이진 라벨 버전)
   모델 확률은 학습 데이터(KOTE 댓글)의 라벨 빈도 π_train을 반영한다. 서비스 데이터(일기)의 빈도 π_target이 다르면
       logit p' = logit p − s · [logit π_train − logit π_target]
   로 고친다(s: 보정 강도 0~1). π_target은
     - "valence_balanced": 긍정·부정 라벨 빈도 합이 같도록 조정(일기 분포를 모를 때의 중립적 가정)
     - "em": 라벨 없는 서비스 데이터의 모델 출력만으로 EM 추정(estimate_priors_em)
     - "custom": 직접 지정
   중 하나로 정한다. 같은 분포(KOTE test)에서는 보정하면 점수가 떨어지는 것이 정상이다.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

EPS = 1e-6
VALENCES = ("positive", "negative", "neutral")


def load_postprocess(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _logit(p):
    p = np.clip(np.asarray(p, dtype=np.float64), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


# ---------------------------------------------------------------- 계층
def hierarchy(cfg: dict, label_names: list[str]) -> dict:
    """설정에서 그룹·정서 구조를 인덱스로 만든다."""
    groups = cfg["groups"]
    g_members = [[label_names.index(l) for l in g["labels"]] for g in groups]
    v_members = {v: [k for k, g in enumerate(groups) if g["valence"] == v] for v in VALENCES}
    label_valence = np.empty(len(label_names), dtype=object)
    for g, ix in zip(groups, g_members):
        label_valence[ix] = g["valence"]
    return {"group_ids": [g["id"] for g in groups], "group_names": [g["name"] for g in groups],
            "group_members": g_members, "valence_members": v_members, "label_valence": label_valence}


def group_scores(label_probs: np.ndarray, H: dict) -> np.ndarray:
    p = np.atleast_2d(label_probs)
    return np.stack([p[:, ix].max(1) for ix in H["group_members"]], 1)


def valence_scores(label_probs: np.ndarray, H: dict) -> np.ndarray:
    g = group_scores(label_probs, H)
    return np.stack([g[:, H["valence_members"][v]].max(1) for v in VALENCES], 1)


# ---------------------------------------------------------------- 사전확률 보정
def target_priors_valence_balanced(train_priors: np.ndarray, H: dict, pos_share: float = 0.5) -> np.ndarray:
    """긍정·부정 라벨 빈도의 합을 pos_share : (1 - pos_share)로 맞춘다. 그룹 안 상대 비율과 '없음'은 유지한다."""
    pi = np.asarray(train_priors, dtype=np.float64).copy()
    pos, neg = H["label_valence"] == "positive", H["label_valence"] == "negative"
    total = pi[pos].sum() + pi[neg].sum()
    pi[pos] *= pos_share * total / pi[pos].sum()
    pi[neg] *= (1 - pos_share) * total / pi[neg].sum()
    return np.clip(pi, 1e-4, 0.95)


def adjust_priors(label_probs: np.ndarray, train_priors, target_priors, strength: float = 1.0) -> np.ndarray:
    shift = _logit(train_priors) - _logit(target_priors)
    return _sigmoid(_logit(label_probs) - strength * shift)


def estimate_priors_em(label_probs: np.ndarray, train_priors, iters: int = 200, tol: float = 1e-6) -> np.ndarray:
    """라벨 없는 데이터의 모델 확률만으로 그 데이터의 라벨 빈도를 추정한다(라벨별 이진 EM)."""
    pi_tr = np.asarray(train_priors, dtype=np.float64)
    pi = pi_tr.copy()
    for _ in range(iters):
        new = adjust_priors(label_probs, pi_tr, pi).mean(0)
        if np.max(np.abs(new - pi)) < tol:
            pi = new
            break
        pi = new
    return np.clip(pi, 1e-4, 0.95)


def apply_postprocess(label_probs: np.ndarray, cfg: dict, H: dict, target_priors=None) -> np.ndarray:
    """설정에 따라 보정한 44개 라벨 확률을 돌려준다. 행성 매핑(compute_planet)에 그대로 넣을 수 있다."""
    pc = cfg["prior_correction"]
    if not pc.get("enabled", False) or pc.get("strength", 0) == 0:
        return np.asarray(label_probs)
    train_pi = np.asarray(cfg["train_priors"]["values"])
    if target_priors is None:
        if pc["target"] == "valence_balanced":
            target_priors = target_priors_valence_balanced(train_pi, H, pc.get("pos_share", 0.5))
        elif pc["target"] == "custom":
            target_priors = np.asarray(pc["custom_priors"])
        else:
            raise ValueError("target이 'em'이면 estimate_priors_em으로 구한 값을 target_priors로 넘겨야 합니다.")
    return adjust_priors(label_probs, train_pi, target_priors, pc.get("strength", 1.0))


def summarize(label_probs_row: np.ndarray, H: dict, label_names: list[str], top_k: int = 5) -> dict:
    """일기 1개의 계층 요약: 주 정서 → 그룹 순위 → 상위 감정."""
    p = np.asarray(label_probs_row)
    v = valence_scores(p, H)[0]
    g = group_scores(p, H)[0]
    order_g, order_l = np.argsort(-g), np.argsort(-p)
    return {
        "valence": {name: round(float(x), 4) for name, x in zip(VALENCES, v)},
        "dominant_valence": VALENCES[int(np.argmax(v))],
        "groups": [{"id": H["group_ids"][k], "name": H["group_names"][k], "score": round(float(g[k]), 4)} for k in order_g],
        "top_labels": [{"label": label_names[j], "prob": round(float(p[j]), 4)} for j in order_l[:top_k]],
    }
