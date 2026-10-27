"""학습 목표(target) 구성: 공식 이진 라벨 / 평가자 투표 비율(soft label) / 행성 감정 그룹.

- soft label: 라벨별 선택 인원(0~5) / 5. raw.json의 원시 주석에서 계산한다.
- 그룹 목표: 그룹에 속한 라벨 중 최댓값(이진이면 OR, soft면 최대 투표 비율).
평가는 항상 공식 이진 라벨로 한다. soft label은 학습에만 쓴다.
"""
from __future__ import annotations

import numpy as np

from src.data.labels import rater_vote_counts


def group_membership(mapping: dict, label_names: list[str]) -> tuple[list[str], list[list[int]]]:
    """행성 매핑의 10개 그룹 + '없음' → (그룹 id 목록, 그룹별 라벨 인덱스 목록)."""
    groups = mapping["groups"] + [{"id": "neutral", "labels": [mapping["neutral"]["label"]]}]
    return [g["id"] for g in groups], [[label_names.index(l) for l in g["labels"]] for g in groups]


def vote_fractions(raw: dict, ids: list[str], label_names: list[str], n_raters: int = 5) -> np.ndarray:
    name_to_id = {n: i for i, n in enumerate(label_names)}
    v = np.stack([rater_vote_counts(raw[i]["labels"], name_to_id, len(label_names)) for i in ids])
    return (v / n_raters).astype(np.float32)


def group_targets(label_targets: np.ndarray, members: list[list[int]]) -> np.ndarray:
    return np.stack([label_targets[:, ix].max(1) for ix in members], 1).astype(np.float32)


def group_scores(label_probs: np.ndarray, members: list[list[int]]) -> np.ndarray:
    """라벨 확률에서 유도한 그룹 점수(그룹 내 최대 확률). 행성 매핑과 같은 정의."""
    return np.stack([label_probs[:, ix].max(1) for ix in members], 1)
