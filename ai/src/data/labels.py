"""KOTE 라벨 대응표와 multi-hot 변환."""
from __future__ import annotations

import ast
from pathlib import Path

import numpy as np

from .paths import load_json


def parse_labels_from_loader_script(script_text: str, var_name: str = "_LABELS") -> list[str]:
    """kote.py 텍스트에서 라벨 리스트 리터럴만 추출한다(코드는 실행하지 않음)."""
    for node in ast.parse(script_text).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == var_name for t in node.targets):
            return list(ast.literal_eval(node.value))
    raise ValueError(f"{var_name} 정의를 찾지 못했습니다.")


def load_label_names(config_path: Path) -> list[str]:
    cfg = load_json(config_path)
    labels = sorted(cfg["labels"], key=lambda x: x["id"])
    if [x["id"] for x in labels] != list(range(len(labels))):
        raise ValueError("라벨 ID가 0부터 연속되지 않습니다.")
    return [x["name"] for x in labels]


def to_multihot(label_lists, num_labels: int, dtype=np.float32) -> np.ndarray:
    """라벨 ID 리스트들을 (N, num_labels) multi-hot 행렬로 변환한다.

    - 빈 리스트 []는 모든 값이 0인 벡터가 된다. '없음' 라벨(특정 ID)과는 다르다.
    - None(라벨 결측)이나 범위를 벗어난 ID가 있으면 ValueError로 중단한다.
    - 한 샘플 안의 중복 ID는 1로 합쳐진다(중복 여부는 품질 점검에서 따로 보고).
    """
    out = np.zeros((len(label_lists), num_labels), dtype=dtype)
    for i, labels in enumerate(label_lists):
        if labels is None:
            raise ValueError(f"{i}번째 샘플의 라벨이 결측입니다.")
        for lab in labels:
            if not 0 <= int(lab) < num_labels:
                raise ValueError(f"{i}번째 샘플에 범위 밖 라벨 ID {lab}가 있습니다.")
            out[i, int(lab)] = 1
    return out


def rater_vote_counts(raters: dict[str, list[str]], name_to_id: dict[str, int], num_labels: int) -> np.ndarray:
    """한 댓글의 원시 주석(평가자별 라벨명 목록)을 라벨별 선택 인원 수(0~평가자 수)로 집계한다.

    같은 평가자가 같은 라벨을 중복 기록한 경우 1명으로 센다.
    """
    counts = np.zeros(num_labels, dtype=np.int64)
    for names in raters.values():
        for name in set(names):
            counts[name_to_id[name]] += 1
    return counts


def dichotomize_paper_rule(counts: np.ndarray, threshold: float = 0.2) -> list[int]:
    """KOTE 논문(arXiv:2205.05300) 4.4절의 이진화 규칙.

    댓글별로 라벨 선택 수(0~5)를 min-max 스케일링한 뒤 threshold를 *초과*하면 1.
    """
    lo, hi = counts.min(), counts.max()
    if hi == lo:
        return []
    scaled = (counts - lo) / (hi - lo)
    return np.flatnonzero(scaled > threshold).tolist()
