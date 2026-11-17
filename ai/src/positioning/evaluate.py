"""좌표 방식 평가: 순차 삽입 실행, 이웃 보존, 관련 기억 배치, 간격, 안정성, 순서 의존성.

주의: '기존 좌표 이동량 0'은 규칙을 지켰다는 뜻일 뿐 배치 품질이 좋다는 뜻이 아니다.
품질은 이웃 보존·관련 기억 배치 지표로 따로 본다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.manifold import trustworthiness

from .store import LayoutStore


def run_sequential(make_store, ids: list[str], E: np.ndarray, embedding_version: str) -> dict:
    """ids 순서대로 한 개씩 추가하면서, 매번 기존 좌표가 그대로인지 확인한다."""
    store: LayoutStore = make_store()
    max_move, times = 0.0, []
    for i, d in enumerate(ids):
        before = store.coords()
        rec, created = store.add(d, E[i], embedding_version)
        assert created
        after = store.coords()[: len(before)]
        if len(before):
            max_move = max(max_move, float(np.abs(after - before).max()))
        times.append(rec.elapsed_ms)
    return {"store": store, "max_existing_move": max_move, "elapsed_ms": np.array(times)}


def coords_in_order(store: LayoutStore, ids: list[str]) -> np.ndarray:
    return np.array([store.get(d).xyz for d in ids])


def _knn(D: np.ndarray, k: int) -> np.ndarray:
    D = D.copy()
    np.fill_diagonal(D, np.inf)
    return np.argsort(D, axis=1, kind="stable")[:, :k]


def layout_metrics(E: np.ndarray, X: np.ndarray, R: np.ndarray, min_dist: float, k: int = 5) -> dict:
    """E: 원본 임베딩(정규화), X: 3D 좌표, R: 관련성(같은 순서)."""
    S = E @ E.T
    D3 = np.linalg.norm(X[:, None] - X[None], axis=2)
    nn_e, nn_3 = _knn(1 - S, k), _knn(D3, k)
    knn_pres = float(np.mean([len(set(a) & set(b)) / k for a, b in zip(nn_e, nn_3)]))
    iu, ju = np.triu_indices(len(X), 1)
    d, rel = D3[iu, ju], R[iu, ju]
    # 3D 공간의 가장 가까운 3개가 관련 기억인지
    nn3_3 = _knn(D3, 3)
    rel_top3 = np.array([R[i, nn3_3[i]] for i in range(len(X))])
    has2 = (R == 2).any(1)
    nn_dist = np.sort(D3 + np.diag(np.full(len(X), np.inf)), 1)[:, 0]
    return {
        f"knn_preservation@{k}": knn_pres,
        f"trustworthiness@{k}": float(trustworthiness(E, X, n_neighbors=k, metric="cosine")),
        "dist_rel2_mean": float(d[rel == 2].mean()),
        "dist_rel1_mean": float(d[rel == 1].mean()),
        "dist_rel0_mean": float(d[rel == 0].mean()),
        "rel0_over_rel2_dist_ratio": float(d[rel == 0].mean() / d[rel == 2].mean()),
        "nn3_rel1plus_share": float((rel_top3 >= 1).mean()),
        "nn3_rel0_share": float((rel_top3 == 0).mean()),
        "nn3_direct_hit": float((rel_top3[has2] == 2).any(1).mean()),
        "min_pair_dist": float(d.min()),
        "n_pairs_below_min_dist": int((d < min_dist - 1e-9).sum()),
        "nn_dist_median": float(np.median(nn_dist)),
        "radius_min": float(np.linalg.norm(X, axis=1).min()),
        "radius_max": float(np.linalg.norm(X, axis=1).max()),
    }


def isolated_and_mixed(df: pd.DataFrame, X: np.ndarray, R: np.ndarray, store: LayoutStore | None = None) -> pd.DataFrame:
    """고립 기록(관련 기록 없음)·복합 주제 기록의 3D 배치 확인."""
    D3 = np.linalg.norm(X[:, None] - X[None], axis=2)
    np.fill_diagonal(D3, np.inf)
    med_nn = float(np.median(D3.min(1)))
    rows = []
    for i in range(len(df)):
        iso = not (R[i] >= 1).any()
        if not (iso or df["is_mixed"].iat[i]):
            continue
        nn = np.argsort(D3[i])[:5]
        topics = df["topics"].iat[i]
        row = {"diary_id": df["diary_id"].iat[i], "kind": "isolated" if iso else "mixed", "topics": "+".join(topics),
               "nn_dist_over_median": float(D3[i].min() / med_nn),
               "nn5": ",".join(df["diary_id"].iat[j] for j in nn),
               "nn5_rel1plus": int((R[i, nn] >= 1).sum())}
        if not iso:
            row["nn5_covers_all_topics"] = all(any(t in df["topics"].iat[j] for j in nn) for t in topics)
        if store is not None:
            rec = store.get(df["diary_id"].iat[i])
            row["placement_rule"], row["anchors"] = rec.rule, ",".join(rec.anchor_ids)
        rows.append(row)
    return pd.DataFrame(rows)


def order_dependence(make_store, ids: list[str], E: np.ndarray, embedding_version: str,
                     n_orders: int = 5, seed: int = 0) -> dict:
    """삽입 순서를 바꿨을 때 같은 일기의 좌표 차이(일기별 최대 편차의 평균·최대)."""
    rng = np.random.default_rng(seed)
    runs = []
    for r in range(n_orders):
        perm = np.arange(len(ids)) if r == 0 else rng.permutation(len(ids))
        res = run_sequential(make_store, [ids[i] for i in perm], E[perm], embedding_version)
        runs.append(coords_in_order(res["store"], ids))
    C = np.stack(runs)                                   # (orders, n, 3)
    dev = np.linalg.norm(C - C[0][None], axis=2).max(0)  # 기준 순서 대비 최대 이동
    return {"n_orders": n_orders, "mean_item_shift": float(dev.mean()), "max_item_shift": float(dev.max()),
            "share_items_shifted": float((dev > 1e-6).mean()), "coords_by_order": C}
