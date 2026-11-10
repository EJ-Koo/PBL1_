"""특수 행성 선택기 확인: 실제 감정 모델(KcELECTRA)·임베딩 모델(KURE-v1)로 가상 일기를 분석해 점수와 선택 결과를 본다.

    1. configs/special_planet_cases.json (대표·모호·부정 반례·주제 충돌)
    2. 참조 코퍼스(가상 일기 88개)에서 특수 행성이 되는 비율(정규화에 쓴 코퍼스라 참고용)

사용 (저장소 루트): .venv/Scripts/python ai/scripts/special_planet_check.py [--json out.json]
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402

configure_hf_cache(get_paths(AI_ROOT))

import torch  # noqa: E402

from src.embedding.encoders import TextEncoder, load_specs  # noqa: E402
from src.emotion.pipeline import DiaryEmotionPipeline  # noqa: E402
from src.special.design import build_design, group_states  # noqa: E402
from src.special.selector import SpecialPlanetSelector, load_special  # noqa: E402


def run(pipe, sel, cfg, texts, topics):
    probs = pipe.predict_proba(texts)
    visuals = pipe.analyze(texts)
    groups = [group_states(p, pipe.labels, pipe.mapping, pipe.thresholds) for p in probs]
    sels = sel.select_batch(texts, probs, pipe.thresholds, topics, groups)
    return [(v, s, build_design(v["visual"], s, cfg)) for v, s in zip(visuals, sels)]


def main(json_out: Path | None) -> int:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = DiaryEmotionPipeline(AI_ROOT, device=device)
    service = load_json(AI_ROOT / "configs" / "service.json")["positioning"]
    specs = load_specs(load_json(AI_ROOT / "configs" / service["embedding_models_config"]))
    enc = TextEncoder(specs[service["embedding_model"]], device=device).load()
    cfg = load_special(AI_ROOT / "configs" / "special_planet.json")
    sel = SpecialPlanetSelector(cfg, pipe.labels, encoder=enc)
    print(f"selector {sel.version}, threshold {cfg['threshold']}, margin {cfg['min_margin']}, weights {cfg['weights']}")

    cases = load_json(AI_ROOT / "configs" / "special_planet_cases.json")["cases"]
    res = run(pipe, sel, cfg, [c["text"] for c in cases], [c["topic"] for c in cases])
    n_ok = 0
    dump = []
    for c, (a, s, d) in zip(cases, res):
        got = s["type"] or "normal"
        accept = c.get("accept", [c["expect"]])
        ok = got in accept
        n_ok += ok
        top = [f"{x['label']} {x['prob']:.2f}" for x in a["emotion"]["top_labels"][:3]]
        sc = s["scores"]
        order = sorted(sc, key=lambda t: -sc[t]["S"])
        print(f"\n[{'OK ' if ok else 'XX '}] {c['id']} ({c['group']}) 기대 {'/'.join(accept)} → {got}"
              f"   주제 선택: {c['topic'] or '없음'}")
        print(f"   감정: {a['visual']['state']} {a['visual']['primary']['name']} | 상위 {', '.join(top)}")
        for t in order[:2]:
            v = sc[t]
            print(f"   {t:8s} S {v['S']:.3f} = .4·T {v['T']:.2f} + .3·E {v['E']:.2f} + .3·C {v['C']:.2f}")
        ev = s["evidence"]
        print(f"   키워드 {ev['keywords']} 부정 {ev['negated_keywords']} | 문장 '{ev['best_sentence'][:40]}' ({ev['sentence']:.2f})")
        print(f"   checks {s['checks']} margin {s['margin']}")
        print(f"   이유: {s['reason']}")
        dump.append({"case": c, "selection": s, "design": d, "emotion": a["emotion"]})
    print(f"\n사례 {len(cases)}개 중 기대(허용) 결과 {n_ok}개")
    by_group = Counter(c["group"] for c in cases)
    ok_group = Counter(c["group"] for c, (_, s, _) in zip(cases, res) if (s["type"] or "normal") in c.get("accept", [c["expect"]]))
    for g in by_group:
        print(f"  {g}: {ok_group[g]}/{by_group[g]}")

    # 참조 코퍼스 (정규화에 쓴 가상 일기라 독립 평가가 아님)
    pilot = load_json(AI_ROOT / "configs" / "pilot_diaries.json")["diaries"]
    demo = load_json(AI_ROOT / "configs" / "demo_diaries.json")["diaries"]
    ref = [(d["diary_id"], "/".join(d["topics"]), d["text"]) for d in pilot] + [(d["id"], d["intended"], d["text"]) for d in demo]
    rres = run(pipe, sel, cfg, [t for *_, t in ref], None)
    types = Counter((s["type"] or "normal") for _, s, _ in rres)
    print(f"\n참조 코퍼스 {len(ref)}개(주제 선택 없음): {dict(types)}  특수 비율 {1 - types['normal'] / len(ref):.1%}")
    for (did, tag, text), (_, s, _) in zip(ref, rres):
        if s["special"]:
            print(f"   {did} [{tag}] → {s['type']} S {s['score']:.3f} | {text[:50]}")
    near = sorted(((s["score"], did, s["candidate"], s["checks"]) for (did, _, _), (_, s, _) in zip(ref, rres) if not s["special"]), reverse=True)[:5]
    print("   일반 행성 중 점수가 높은 5개:", [(d, c, round(sc, 3), [k for k, v in ch.items() if not v]) for sc, d, c, ch in near])
    if json_out:
        json_out.parent.mkdir(parents=True, exist_ok=True)
        json_out.write_text(json.dumps({"cases": dump, "reference_counts": dict(types)}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    out = Path(sys.argv[sys.argv.index("--json") + 1]) if "--json" in sys.argv else None
    sys.exit(main(out))
