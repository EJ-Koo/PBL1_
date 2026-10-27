"""2단계 핵심 흐름을 실제 모델·가상 일기로 처음부터 끝까지 실행하고 근거(JSON 로그)를 남긴다.

흐름: 일기 텍스트 → 임베딩(실제 모델, CPU) → 관련 기억 검색(코사인 ≥ τ) → 좌표 생성(C: 의미 이웃 순차 삽입,
      이웃 없으면 고정 PCA 위치) → 새 일기 추가 시 기존 좌표 유지 → 같은 ID 재요청 → 관련 기록 없음 처리
      → 저장 → 재로딩 → 재로딩 뒤 추가

전제: 07 노트북을 먼저 실행해 ai/outputs/step2/results/retrieval_results.json(선택 모델·dev τ)이 있어야 한다.
투영기·τ는 이 스크립트에서 dev 일기를 다시 인코딩해 새로 만들고, 07의 τ와 같은지 확인한다(재현성).
운영 백엔드·DB와는 연결하지 않는다. 결과는 ai/outputs/step2/e2e/ (Git 제외)에만 쓴다.

사용 예 (저장소 루트에서):
    .venv/Scripts/python ai/scripts/step2_e2e_check.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402

# 평가셋에 없는 새 가상 일기(개발자 작성). 하나는 우주에 있는 주제(햄스터), 하나는 없는 주제(텃밭).
NEW_DIARIES = [
    ("NEW_A", "햄스터 케이지에 새 쳇바퀴를 달아줬더니 밤새 신나게 돌린다. 소리가 조금 시끄럽지만 귀여워서 참는다."),
    ("NEW_B", "베란다 화분에 심은 방울토마토가 처음으로 빨갛게 익었다. 물 주는 걸 몇 번 잊었는데도 잘 자라줬다."),
    ("NEW_C", "어제 정리하다 만 책장을 마저 비우고 이삿짐 상자에 번호를 붙였다."),
]


def main() -> int:
    P = get_paths(AI_ROOT)
    configure_hf_cache(P)
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

    import numpy as np
    from src.embedding import retrieval as RT
    from src.embedding.encoders import TextEncoder, load_specs
    from src.positioning.projectors import FixedPCAProjector
    from src.positioning.store import LayoutStore, NeighborPlacer
    from src.positioning.universe import MemoryUniverse

    exp = load_json(P.configs / "step2_experiment.json")
    models_cfg = load_json(P.configs / "embedding_models.json")
    out = P.ai_root / exp["outputs_dir"] / "e2e"
    res_path = P.ai_root / exp["outputs_dir"] / "results" / "retrieval_results.json"
    if not res_path.exists():
        print("먼저 ai/notebooks/07_embedding_retrieval.ipynb를 실행하세요(선택 모델·τ 필요).")
        return 2
    ret = load_json(res_path)
    key = ret["selected_model"]
    df, raw = RT.load_pilot(P.configs / exp["dataset"])
    R_all, _ = RT.build_relevance(df, raw)
    dev, test = df[df.split == "dev"].reset_index(drop=True), df[df.split == "test"].reset_index(drop=True)

    log = {"started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "note": "합성 pilot 가상 일기로 한 로컬 실행 근거. 실제 사용자 일기·운영 DB 아님.",
           "model": key, "steps": [], "checks": {}}
    checks = log["checks"]

    def step(name, **kw):
        log["steps"].append({"step": name, **kw})
        print(f"[{name}] " + ", ".join(f"{k}={v}" for k, v in kw.items() if k not in ("related_detail",)))

    # 1) 실제 모델 로딩
    enc = TextEncoder(load_specs(models_cfg)[key], device=models_cfg["device"]).load()
    step("load_model", model_id=enc.spec.model_id, embedding_version=enc.embedding_version,
         load_s=round(enc.stats.load_s, 2), device=models_cfg["device"])
    checks["embedding_version_matches_07"] = enc.embedding_version == ret["thresholds"][key]["embedding_version"]

    # 2) 참조(dev) 인코딩 → 투영기 fit, τ 재계산
    E_dev = enc.encode(dev.text.tolist())
    m_dev = (df.split == "dev").to_numpy()
    tau_info = RT.choose_threshold(RT.pair_table(RT.cosine_matrix(E_dev), R_all[np.ix_(m_dev, m_dev)], dev), 2)
    tau = tau_info["tau"]
    checks["tau_reproduced"] = abs(tau - ret["thresholds"][key]["tau"]) < 1e-3
    checks["embedding_dim_and_norm"] = bool(E_dev.shape[1] == enc.spec.dim and np.allclose(np.linalg.norm(E_dev, axis=1), 1, atol=1e-4))
    pca = FixedPCAProjector(exp["layout"]["target_radius"]).fit(E_dev)
    step("fit_reference", n_ref=len(dev), tau=round(tau, 4), tau_07=round(ret["thresholds"][key]["tau"], 4),
         pca_fingerprint=pca.fingerprint)

    placer = NeighborPlacer(pca, tau=tau, k=exp["layout"]["neighbor"]["k"], gap=exp["layout"]["neighbor"]["gap"])
    store = LayoutStore(placer, enc.embedding_version, exp["layout"]["min_dist"])
    uni = MemoryUniverse(enc, store, tau, k_related=exp["retrieval"]["k_link"])

    # 3) 첫 일기 + 4) 순차 추가(매번 기존 좌표 비교)
    test_ids = test.diary_id.tolist()
    max_move, enc_ms, adds = 0.0, [], []
    for d, text in zip(test_ids, test.text):
        before = store.coords()
        t0 = time.perf_counter()
        r = uni.add_diary(d, text)
        enc_ms.append((time.perf_counter() - t0) * 1000)
        if len(before):
            max_move = max(max_move, float(np.abs(store.coords()[: len(before)] - before).max()))
        adds.append({"diary_id": d, "created": r.created, "xyz": [round(v, 3) for v in r.xyz], "rule": r.rule,
                     "related": [(i, round(s, 3)) for i, s in r.related]})
    first = adds[0]
    step("first_diary", diary_id=first["diary_id"], xyz=first["xyz"], rule=first["rule"], related=first["related"])
    checks["first_diary_has_coords"] = first["created"] and first["rule"] == "first_star_pca" and not first["related"]
    checks["existing_coords_never_moved"] = max_move == 0.0
    step("sequential_add", n=len(adds), max_existing_move=max_move,
         add_ms_median=round(float(np.median(enc_ms)), 1), add_ms_max=round(float(np.max(enc_ms)), 1))
    log["adds"] = adds

    # 5) 같은 ID 재요청
    n0, c0 = len(store), store.coords().copy()
    dup = uni.add_diary(test_ids[6], "내용이 바뀐 재요청이라도 같은 diary_id면 새로 만들지 않는다")
    checks["duplicate_not_recreated"] = (not dup.created) and len(store) == n0 and np.array_equal(store.coords(), c0) \
        and list(dup.xyz) == [store.get(test_ids[6]).x, store.get(test_ids[6]).y, store.get(test_ids[6]).z]
    step("duplicate_request", diary_id=test_ids[6], created=dup.created, n_before=n0, n_after=len(store))

    # 6) 관련 기록 없음 처리: 평가셋 고립 기록 + 새 일기
    iso_ids = [d for d in test_ids if not (R_all[np.ix_((df.diary_id == d).to_numpy(), (df.split == "test").to_numpy())] >= 1).any()]
    iso = {a["diary_id"]: a for a in adds if a["diary_id"] in iso_ids}
    step("isolated_in_pilot", **{d: {"related": v["related"], "rule": v["rule"]} for d, v in iso.items()})
    new_results = {}
    for d, text in NEW_DIARIES[:2]:
        before = store.coords()
        r = uni.add_diary(d, text)
        new_results[d] = {"xyz": [round(v, 3) for v in r.xyz], "rule": r.rule, "related": [(i, round(s, 3)) for i, s in r.related],
                          "moved_existing": float(np.abs(store.coords()[: len(before)] - before).max())}
        step("new_diary", diary_id=d, **new_results[d])
    # 모델 판단 결과(규칙 준수 여부가 아니라 관찰값): 통과/실패 집계에 넣지 않는다
    obs = log["observations"] = {}
    obs["NEW_A_linked_to_hamster_diaries"] = any(i in ("D069", "D070", "D073") for i, _ in new_results["NEW_A"]["related"])
    obs["NEW_B_no_related_and_pca_fallback"] = new_results["NEW_B"]["related"] == [] and new_results["NEW_B"]["rule"] == "no_neighbor_pca"
    obs["pilot_isolated_with_link"] = [d for d, v in iso.items() if v["related"]]
    checks["new_diaries_did_not_move_existing"] = all(v["moved_existing"] == 0 for v in new_results.values())

    # 7) 저장 → 재로딩 → 재로딩 뒤 추가
    folder = out / "store"
    store.save(folder)          # stars.json·embeddings.npy를 덮어쓴다(OneDrive 폴더 삭제 권한 오류를 피하려고 폴더는 지우지 않음)
    store2 = LayoutStore.load(folder, placer)
    checks["reload_identical"] = store2.ids == store.ids and np.array_equal(store2.coords(), store.coords()) \
        and all(a.embedding_version == b.embedding_version and a.layout_version == b.layout_version
                for a, b in zip(store2.records(), store.records()))
    uni2 = MemoryUniverse(enc, store2, tau, k_related=exp["retrieval"]["k_link"])
    before = store2.coords()
    r = uni2.add_diary(*NEW_DIARIES[2])
    moved = float(np.abs(store2.coords()[: len(before)] - before).max())
    checks["add_after_reload_keeps_existing"] = r.created and moved == 0.0
    step("reload_and_add", saved_to=folder.relative_to(P.repo_root).as_posix(), n_loaded=len(store),
         new_id=NEW_DIARIES[2][0], related=[(i, round(s, 3)) for i, s in r.related], rule=r.rule, moved_existing=moved)
    dup2 = uni2.add_diary(test_ids[0], "")
    checks["duplicate_after_reload_not_recreated"] = not dup2.created

    enc.close()
    log["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    log["all_passed"] = all(bool(v) for v in checks.values())
    out.mkdir(parents=True, exist_ok=True)
    (out / "e2e_run_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    print("\n점검 결과")
    for k, v in checks.items():
        print(f"  {'통과' if v else '실패'}  {k}")
    print("관찰(모델 판단, 집계 제외):", log["observations"])
    print("로그 저장:", (out / "e2e_run_log.json").relative_to(P.repo_root).as_posix())
    return 0 if log["all_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
