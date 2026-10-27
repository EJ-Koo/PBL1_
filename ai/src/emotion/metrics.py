"""다중 라벨 분류 지표(numpy 구현).

- 정밀도/재현율/F1: 분모가 0이면 0으로 둔다(scikit-learn zero_division=0과 같은 규칙).
- ROC-AUC: Mann-Whitney 순위 공식(동점은 평균 순위). 양성 또는 음성이 없는 라벨은 NaN.
"""
from __future__ import annotations

import numpy as np


def binarize(probs: np.ndarray, threshold) -> np.ndarray:
    """threshold는 스칼라 또는 라벨별 (L,) 배열. threshold 이상이면 1."""
    return (probs >= np.asarray(threshold, dtype=probs.dtype)).astype(np.int8)


def _safe_div(a, b):
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    return np.divide(a, b, out=np.zeros_like(a), where=b != 0)


def per_label_counts(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, np.ndarray]:
    y_true, y_pred = y_true.astype(bool), y_pred.astype(bool)
    tp = (y_true & y_pred).sum(0)
    fp = (~y_true & y_pred).sum(0)
    fn = (y_true & ~y_pred).sum(0)
    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    f1 = _safe_div(2 * precision * recall, precision + recall)
    return {"tp": tp, "fp": fp, "fn": fn, "support": y_true.sum(0),
            "precision": precision, "recall": recall, "f1": f1}


def _average_ranks(x: np.ndarray) -> np.ndarray:
    order = np.argsort(x, kind="mergesort")
    xs = x[order]
    _, start, counts = np.unique(xs, return_index=True, return_counts=True)
    ranks = np.empty(len(x), dtype=np.float64)
    ranks[order] = np.repeat(start + (counts - 1) / 2.0 + 1.0, counts)
    return ranks


def roc_auc_per_label(y_true: np.ndarray, probs: np.ndarray) -> np.ndarray:
    out = np.full(y_true.shape[1], np.nan)
    for j in range(y_true.shape[1]):
        pos = y_true[:, j].astype(bool)
        n_pos, n_neg = int(pos.sum()), int((~pos).sum())
        if n_pos == 0 or n_neg == 0:
            continue
        r = _average_ranks(probs[:, j].astype(np.float64))
        out[j] = (r[pos].sum() - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)
    return out


def multilabel_metrics(y_true: np.ndarray, probs: np.ndarray, threshold) -> dict:
    y_pred = binarize(probs, threshold)
    c = per_label_counts(y_true, y_pred)
    tp, fp, fn = c["tp"].sum(), c["fp"].sum(), c["fn"].sum()
    micro_p, micro_r = float(_safe_div(tp, tp + fp)), float(_safe_div(tp, tp + fn))
    micro_f1 = float(_safe_div(2 * micro_p * micro_r, micro_p + micro_r))
    support = c["support"].astype(np.float64)
    inter = (y_true.astype(bool) & y_pred.astype(bool)).sum(1)
    denom = y_true.sum(1) + y_pred.sum(1)
    samples_f1 = float(_safe_div(2 * inter, denom).mean())
    auc = roc_auc_per_label(y_true, probs)
    return {
        "micro_precision": micro_p, "micro_recall": micro_r, "micro_f1": micro_f1,
        "macro_precision": float(c["precision"].mean()), "macro_recall": float(c["recall"].mean()),
        "macro_f1": float(c["f1"].mean()),
        "weighted_f1": float((c["f1"] * support).sum() / support.sum()),
        "samples_f1": samples_f1,
        "macro_roc_auc": float(np.nanmean(auc)),
        "subset_accuracy": float((y_pred == y_true.astype(np.int8)).all(1).mean()),
        "mean_true_labels": float(y_true.sum(1).mean()),
        "mean_pred_labels": float(y_pred.sum(1).mean()),
    }


def threshold_grid(start: float, stop: float, step: float) -> np.ndarray:
    return np.round(np.arange(start, stop + 1e-9, step), 4)


def tune_global_threshold(y_true: np.ndarray, probs: np.ndarray, grid: np.ndarray) -> tuple[float, float]:
    """모든 라벨에 같은 threshold를 쓸 때 macro-F1이 최대인 값(검증 데이터에서만 사용)."""
    scores = [per_label_counts(y_true, binarize(probs, t))["f1"].mean() for t in grid]
    k = int(np.argmax(scores))
    return float(grid[k]), float(scores[k])


def tune_per_label_thresholds(y_true: np.ndarray, probs: np.ndarray, grid: np.ndarray) -> np.ndarray:
    """라벨마다 F1이 최대인 threshold(검증 데이터에서만 사용). 동점이면 작은 값."""
    f1 = np.stack([per_label_counts(y_true, binarize(probs, t))["f1"] for t in grid])  # (G, L)
    return grid[np.argmax(f1, axis=0)].astype(np.float64)
