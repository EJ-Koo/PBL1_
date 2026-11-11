"""특수 행성 선택기의 정규화 범위 계산 → configs/special_planet_normalization.json에 기록.

참조 코퍼스 = 저장소의 가상 일기(configs/pilot_diaries.json 76개 + configs/demo_diaries.json 12개). 실제 사용자 일기는 쓰지 않는다.
유형마다 (1) 일기 전체 ↔ 대표 주제 문장 중심 코사인, (2) 가장 가까운 문장 ↔ 대표 사건 문장 코사인의 분포를 구해
low_pct 백분위 → 0, high_pct 백분위 → 1로 옮기는 범위를 저장한다. 가중치·임계값은 바꾸지 않는다.

사용 (저장소 루트): .venv/Scripts/python ai/scripts/calibrate_special_planet.py [--dry-run]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402

configure_hf_cache(get_paths(AI_ROOT))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from src.data.labels import load_label_names  # noqa: E402
from src.embedding.encoders import TextEncoder, load_specs  # noqa: E402
from src.special.selector import SpecialPlanetSelector, load_special  # noqa: E402


def reference_texts() -> list[str]:
    pilot = load_json(AI_ROOT / "configs" / "pilot_diaries.json")["diaries"]
    demo = load_json(AI_ROOT / "configs" / "demo_diaries.json")["diaries"]
    return [d["text"] for d in pilot] + [d["text"] for d in demo]


def main(dry_run: bool) -> None:
    cfg_path = AI_ROOT / "configs" / "special_planet.json"
    cfg = load_special(cfg_path)
    service = load_json(AI_ROOT / "configs" / "service.json")["positioning"]
    specs = load_specs(load_json(AI_ROOT / "configs" / service["embedding_models_config"]))
    enc = TextEncoder(specs[service["embedding_model"]], device="cuda" if torch.cuda.is_available() else "cpu").load()
    sel = SpecialPlanetSelector(cfg, load_label_names(AI_ROOT / "configs" / "kote_labels.json"), encoder=enc)
    texts = reference_texts()
    raws = sel.raw_similarities(texts)
    lo_p, hi_p = cfg["normalization"]["low_pct"], cfg["normalization"]["high_pct"]
    norm = {"topic": {}, "context": {}}
    print(f"참조 일기 {len(texts)}개, 백분위 {lo_p} → 0, {hi_p} → 1")
    for t in sel.types:
        for kind in ("topic", "context"):
            v = np.array([r[t][kind] for r in raws])
            lo, hi = float(np.percentile(v, lo_p)), float(np.percentile(v, hi_p))
            norm[kind][t] = [round(lo, 4), round(hi, 4)]
            print(f"  {t:8s} {kind:8s} min {v.min():.3f}  p{lo_p} {lo:.3f}  p{hi_p} {hi:.3f}  max {v.max():.3f}")
    if dry_run:
        return
    out_path = cfg_path.parent / cfg["normalization"]["values_file"]
    out = {
        "embedding_version": enc.embedding_version,
        "reference": f"pilot_diaries.json 76 + demo_diaries.json 12 (가상 일기 {len(texts)}개)",
        "percentiles": [lo_p, hi_p],
        "topic": norm["topic"],
        "context": norm["context"],
    }
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"저장: {out_path}")


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
