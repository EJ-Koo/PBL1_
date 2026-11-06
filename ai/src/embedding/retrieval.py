"""가상 일기 평가셋 로딩, 관련성 정의, 관련 기억 검색 평가.

관련성(같은 split 안에서만 정의, 자기 자신 제외):
    2 = 같은 사건(thread) 또는 relevance_overrides에 적은 쌍 — 직접 관련
    1 = 공유하는 주제(topic)가 있지만 다른 사건 — 넓은 주제만 유사
    0 = 공유 주제 없음 — 연결 근거 부족
   -1 = 비교 대상 아님(자기 자신, 다른 split)

모델 입력은 text만 쓴다. 주제·사건·정서 태그는 평가에만 쓴다.
코사인 유사도는 확률이 아니다. 연결 여부는 dev에서 정한 임계값으로만 판단한다.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from src.data.paths import load_json


# ---------------------------------------------------------------- 데이터·관련성

def load_pilot(path: Path) -> tuple[pd.DataFrame, dict]:
    raw = load_json(path)
    df = pd.DataFrame(raw["diaries"])
    df["n_chars"] = df["text"].str.len()
    df["length_group"] = np.where(df["case_types"].map(lambda c: "short" in c), "short",
                                  np.where(df["case_types"].map(lambda c: "long" in c), "long", "normal"))
    df["is_mixed"] = df["topics"].map(len) > 1
    return df, raw


def build_relevance(df: pd.DataFrame, raw: dict) -> tuple[np.ndarray, np.ndarray]:
    """(R, reason) n×n. R은 -1/0/1/2, reason은 판정 근거 문자열."""
    n = len(df)
    idx = {d: i for i, d in enumerate(df["diary_id"])}
    R = np.full((n, n), -1, dtype=np.int8)
    reason = np.full((n, n), "", dtype=object)
    topics = [set(t) for t in df["topics"]]
    threads = df["thread"].tolist()
    splits = df["split"].tolist()
    for i in range(n):
        for j in range(n):
            if i == j or splits[i] != splits[j]:
                continue
            if threads[i] is not None and threads[i] == threads[j]:
                R[i, j], reason[i, j] = 2, f"same_thread:{threads[i]}"
            elif topics[i] & topics[j]:
                R[i, j], reason[i, j] = 1, "shared_topic:" + ",".join(sorted(topics[i] & topics[j]))
            else:
                R[i, j], reason[i, j] = 0, "no_shared_topic"
    for a, b, rel, why in raw.get("relevance_overrides", {}).get("pairs", []):
        i, j = idx[a], idx[b]
        if splits[i] != splits[j]:
            raise ValueError(f"override {a}-{b}: split이 다름")
        R[i, j] = R[j, i] = rel
        reason[i, j] = reason[j, i] = f"override:{why}"
    return R, reason


def relevance_review_table(df: pd.DataFrame, raw: dict, R: np.ndarray, reason: np.ndarray) -> pd.DataFrame:
    """사람이 검토할 쌍 목록: 관련성 1·2인 모든 쌍 + 혼동 쌍(0). 쌍마다 한 줄(i<j)."""
    ids = df["diary_id"].tolist()
    conf = {frozenset(p[:2]): p[2] for p in raw.get("confuser_pairs", {}).get("pairs", [])}
    para = {frozenset(p[:2]): p[2] for p in raw.get("paraphrase_pairs", {}).get("pairs", [])}
    rows = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            key = frozenset((ids[i], ids[j]))
            if R[i, j] >= 1 or key in conf:
                rows.append({
                    "split": df["split"].iat[i], "a": ids[i], "b": ids[j], "relevance": int(R[i, j]),
                    "reason": reason[i, j], "confuser_word": conf.get(key, ""), "paraphrase": para.get(key, ""),
                    "a_text": df["text"].iat[i][:60], "b_text": df["text"].iat[j][:60],
                })
    return pd.DataFrame(rows).sort_values(["split", "relevance", "a", "b"], ascending=[True, False, True, True])


def split_view(df: pd.DataFrame, E: np.ndarray, R: np.ndarray, split: str):
    """한 split만 잘라 (부분 df, 임베딩, 관련성)으로 돌려준다."""
    m = (df["split"] == split).to_numpy()
    return df[m].reset_index(drop=True), E[m], R[np.ix_(m, m)]


# ---------------------------------------------------------------- 검색 지표

def cosine_matrix(E: np.ndarray) -> np.ndarray:
    """정규화된 임베딩이면 내적 = 코사인 유사도. 정규화 여부를 다시 확인한다."""
    norms = np.linalg.norm(E, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-3):
        E = E / norms[:, None]
    return E @ E.T


def ranked_candidates(S: np.ndarray, R: np.ndarray, i: int) -> np.ndarray:
    """질의 i의 후보(R>=0, 즉 같은 split·자기 제외)를 유사도 내림차순으로."""
    cand = np.flatnonzero(R[i] >= 0)
    return cand[np.argsort(-S[i, cand], kind="stable")]


def _dcg(gains: np.ndarray) -> float:
    return float(np.sum(gains / np.log2(np.arange(2, len(gains) + 2))))


def per_query_metrics(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, ks=(1, 3, 5)) -> pd.DataFrame:
    rows = []
    for i in range(len(df)):
        order = ranked_candidates(S, R, i)
        rel = R[i, order].astype(int)
        n2, n1p = int((rel == 2).sum()), int((rel >= 1).sum())
        row = {"diary_id": df["diary_id"].iat[i], "n_rel2": n2, "n_rel1plus": n1p,
               "has_direct": n2 > 0, "isolated": n1p == 0,
               "top1_id": df["diary_id"].iat[order[0]], "top1_sim": float(S[i, order[0]]), "top1_rel": int(rel[0])}
        first2 = np.flatnonzero(rel == 2)
        row["mrr_rel2"] = 1.0 / (first2[0] + 1) if n2 else np.nan
        ideal = np.sort(2.0 ** rel - 1)[::-1]
        for k in ks:
            top = rel[:k]
            row[f"recall@{k}"] = (top == 2).sum() / n2 if n2 else np.nan
            row[f"hit@{k}"] = float((top == 2).any()) if n2 else np.nan
            row[f"ndcg@{k}"] = (_dcg(2.0 ** top - 1) / _dcg(ideal[:k])) if n1p else np.nan
            row[f"unrelated@{k}"] = float((top == 0).mean())   # 상위 k 중 관련성 0 비율
        rows.append(row)
    return pd.DataFrame(rows)


def summarize_queries(pq: pd.DataFrame, ks=(1, 3, 5)) -> dict:
    d = pq[pq["has_direct"]]
    out = {"n_queries": len(pq), "n_with_direct": len(d), "n_isolated": int(pq["isolated"].sum()),
           "mrr_rel2": float(d["mrr_rel2"].mean())}
    for k in ks:
        out[f"recall@{k}"] = float(d[f"recall@{k}"].mean())
        out[f"ndcg@{k}"] = float(pq.loc[~pq["isolated"], f"ndcg@{k}"].mean())
        out[f"unrelated@{k}"] = float(pq[f"unrelated@{k}"].mean())
    return out


# ---------------------------------------------------------------- 쌍 단위·임계값

def pair_table(S: np.ndarray, R: np.ndarray, df: pd.DataFrame) -> pd.DataFrame:
    """비교 가능한 모든 쌍(i<j)의 유사도·관련성·정서 일치 여부."""
    iu, ju = np.triu_indices(len(df), k=1)
    keep = R[iu, ju] >= 0
    iu, ju = iu[keep], ju[keep]
    val = df["valence"].to_numpy()
    return pd.DataFrame({
        "a": df["diary_id"].to_numpy()[iu], "b": df["diary_id"].to_numpy()[ju],
        "sim": S[iu, ju], "rel": R[iu, ju].astype(int), "same_valence": val[iu] == val[ju],
    })


def choose_threshold(pairs: pd.DataFrame, positive_min_rel: int = 2) -> dict:
    """dev 쌍에서 'sim ≥ τ → 연결' 규칙의 F1(양성 = 관련성 ≥ positive_min_rel)이 최대인 τ를 고른다.
    동점이면 더 높은(보수적인) τ. 확인용(test)에서는 이 값을 바꾸지 않는다."""
    y = (pairs["rel"] >= positive_min_rel).to_numpy()
    s = pairs["sim"].to_numpy()
    best = None
    for t in np.unique(np.round(s, 4)):
        pred = s >= t
        tp = int((pred & y).sum()); fp = int((pred & ~y).sum()); fn = int((~pred & y).sum())
        f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
        if best is None or f1 > best["f1"] + 1e-12 or (abs(f1 - best["f1"]) <= 1e-12 and t > best["tau"]):
            best = {"tau": float(t), "f1": f1, "precision": tp / max(tp + fp, 1), "recall": tp / max(tp + fn, 1)}
    return best


def evaluate_links(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, tau: float, k_link: int = 3) -> dict:
    """연결 규칙: 각 일기에서 유사도 상위 k_link개 중 sim ≥ τ인 것만 '관련 기억'으로 보여준다."""
    links, isolated_with_link, zero_link, n_iso = [], 0, 0, 0
    for i in range(len(df)):
        order = ranked_candidates(S, R, i)[:k_link]
        chosen = [j for j in order if S[i, j] >= tau]
        links += [int(R[i, j]) for j in chosen]
        iso = not (R[i] >= 1).any()
        n_iso += iso
        isolated_with_link += iso and bool(chosen)
        zero_link += not chosen
    links = np.array(links, dtype=int)
    n2_total = int((np.triu(R, 1) == 2).sum())
    linked_pairs = set()
    for i in range(len(df)):
        for j in ranked_candidates(S, R, i)[:k_link]:
            if S[i, j] >= tau and R[i, j] == 2:
                linked_pairs.add((min(i, j), max(i, j)))
    return {
        "tau": tau, "k_link": k_link, "n_links": int(len(links)),
        "link_precision_rel2": float((links == 2).mean()) if len(links) else np.nan,
        "link_precision_rel1plus": float((links >= 1).mean()) if len(links) else np.nan,
        "link_unrelated_rate": float((links == 0).mean()) if len(links) else np.nan,
        "rel2_pair_coverage": len(linked_pairs) / max(n2_total, 1),
        "isolated_false_link_rate": isolated_with_link / max(n_iso, 1), "n_isolated": n_iso,
        "queries_without_link": zero_link,
    }


# ---------------------------------------------------------------- 사례 유형별 분석

def emotion_vs_topic(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, tau: float, k: int = 3) -> dict:
    """감정보다 주제·사건을 따라가는지 확인한다.
    - 같은 사건·다른 정서(관련성 2, 정서 다름) 상대가 상위 k에 들어오는 비율 (높을수록 좋음)
    - 다른 주제·같은 정서(관련성 0, 정서 같음) 기록이 상위 k / 임계값 위에 오는 비율 (낮을수록 좋음)
    - 질의별 AUC: sim(같은 사건·다른 정서) > sim(다른 주제·같은 정서)일 확률 (1에 가까울수록 좋음)"""
    val = df["valence"].to_numpy()
    hit, n_q, auc = [], 0, []
    same_val_topk, same_val_above, n_topk_slots = 0, 0, 0
    for i in range(len(df)):
        cand = ranked_candidates(S, R, i)
        top = cand[:k]
        pos = [j for j in cand if R[i, j] == 2 and val[j] != val[i]]
        neg = [j for j in cand if R[i, j] == 0 and val[j] == val[i]]
        n_topk_slots += len(top)
        same_val_topk += sum(R[i, j] == 0 and val[j] == val[i] for j in top)
        same_val_above += sum(S[i, j] >= tau for j in neg)
        if pos:
            n_q += 1
            hit.append(any(j in top for j in pos))
            if neg:
                sp = S[i, pos][:, None]; sn = S[i, neg][None, :]
                auc.append(float(((sp > sn).sum() + 0.5 * (sp == sn).sum()) / (sp.size * sn.size)))
    n_neg_pairs = sum(1 for i in range(len(df)) for j in range(len(df)) if R[i, j] == 0 and val[i] == val[j])
    return {
        "n_queries_diff_emotion_partner": n_q,
        f"diff_emotion_partner_in_top{k}": float(np.mean(hit)) if hit else np.nan,
        "topic_over_emotion_auc": float(np.mean(auc)) if auc else np.nan,
        f"same_emotion_unrelated_share_top{k}": same_val_topk / max(n_topk_slots, 1),
        "same_emotion_unrelated_above_tau": same_val_above / max(n_neg_pairs, 1),
    }


def check_pairs(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, pairs: list, tau: float) -> pd.DataFrame:
    """지정한 쌍(혼동 쌍·표현 다른 같은 활동 쌍)의 유사도와 서로의 검색 순위."""
    idx = {d: i for i, d in enumerate(df["diary_id"])}
    rows = []
    for a, b, note in pairs:
        if a not in idx or b not in idx:
            continue
        i, j = idx[a], idx[b]
        ri = int(np.flatnonzero(ranked_candidates(S, R, i) == j)[0]) + 1
        rj = int(np.flatnonzero(ranked_candidates(S, R, j) == i)[0]) + 1
        rows.append({"a": a, "b": b, "note": note, "relevance": int(R[i, j]), "sim": float(S[i, j]),
                     "rank_b_for_a": ri, "rank_a_for_b": rj, "above_tau": bool(S[i, j] >= tau)})
    return pd.DataFrame(rows)


def mixed_topic_coverage(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, k: int = 5) -> pd.DataFrame:
    """복합 주제 기록: 상위 k 안에 두 주제의 기록이 모두 들어오는지."""
    rows = []
    for i in np.flatnonzero(df["is_mixed"].to_numpy()):
        tops = ranked_candidates(S, R, i)[:k]
        topics_i = df["topics"].iat[i]
        covered = {t: any(t in df["topics"].iat[j] for j in tops) for t in topics_i}
        rows.append({"diary_id": df["diary_id"].iat[i], "topics": "+".join(topics_i),
                     **{f"has_{t}": v for t, v in covered.items()}, "all_topics_covered": all(covered.values()),
                     f"top{k}": ",".join(df["diary_id"].iat[j] for j in tops)})
    return pd.DataFrame(rows)


def evaluate_split(S: np.ndarray, R: np.ndarray, df: pd.DataFrame, tau: float, raw: dict,
                   ks=(1, 3, 5), k_link: int = 3) -> dict:
    """한 split의 전체 평가 묶음."""
    pq = per_query_metrics(S, R, df, ks)
    by_len = pq.assign(length_group=df["length_group"].to_numpy()).query("has_direct") \
        .groupby("length_group")[["recall@3", "mrr_rel2"]].mean()
    return {
        "per_query": pq,
        "summary": summarize_queries(pq, ks),
        "links": evaluate_links(S, R, df, tau, k_link),
        "emotion": emotion_vs_topic(S, R, df, tau, k=3),
        "confusers": check_pairs(S, R, df, raw.get("confuser_pairs", {}).get("pairs", []), tau),
        "paraphrases": check_pairs(S, R, df, raw.get("paraphrase_pairs", {}).get("pairs", []), tau),
        "mixed": mixed_topic_coverage(S, R, df, k=5),
        "by_length": by_len,
    }
