"""기존 행성 생성 결과 회귀 확인: 같은 입력 → 감정 확률·그룹 점수·색·무늬·크기·임베딩·좌표를 기록하고 비교한다.

특수 행성·주제 기능을 붙이기 전에 record로 기준을 남기고, 붙인 뒤 다시 record → compare 한다.
입력은 저장소의 가상 일기(configs/demo_diaries.json 12개 + configs/pilot_diaries.json 76개)만 쓴다(실제 사용자 일기 X).
좌표는 임시 폴더의 새 저장소에 가상 사용자 1명으로 순서대로 넣어 만든다(서비스 저장소·운영 DB를 건드리지 않음).
고정 PCA 투영기는 서비스 저장소의 것을 복사해 쓴다(같은 투영기로 비교).

크기(일기 분량 → size)는 백엔드 규칙이라 backend 가상환경에서 따로 계산해 --sizes 파일로 합친다:
    backend/.venv/Scripts/python ../ai/scripts/planet_regression.py sizes <out.json>   (backend 폴더에서)

사용 (저장소 루트):
    .venv/Scripts/python ai/scripts/planet_regression.py record ai/outputs/regression/before.json
    .venv/Scripts/python ai/scripts/planet_regression.py compare ai/outputs/regression/before.json ai/outputs/regression/after.json
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
REPO = AI_ROOT.parent
FAKE_USER = "00000000-0000-0000-0000-00000000beef"


def regression_texts() -> list[tuple[str, str]]:
    demo = json.loads((AI_ROOT / "configs" / "demo_diaries.json").read_text(encoding="utf-8"))["diaries"]
    pilot = json.loads((AI_ROOT / "configs" / "pilot_diaries.json").read_text(encoding="utf-8"))["diaries"]
    return [(d["id"], d["text"]) for d in demo] + [(d["diary_id"], d["text"]) for d in pilot]


def record(out_path: Path) -> None:
    sys.path.insert(0, str(AI_ROOT))
    from src.data.paths import configure_hf_cache, get_paths, load_json
    configure_hf_cache(get_paths(AI_ROOT))
    import numpy as np
    import torch
    from src.emotion.pipeline import DiaryEmotionPipeline
    from src.positioning.service_layout import UserLayoutService

    device = "cuda" if torch.cuda.is_available() else "cpu"
    items = regression_texts()
    texts = [t for _, t in items]
    pipe = DiaryEmotionPipeline(AI_ROOT, device=device)
    probs = pipe.predict_proba(texts)
    analyzed = pipe.analyze(texts)

    cfg = load_json(AI_ROOT / "configs" / "service.json")
    src_dir = AI_ROOT / cfg["positioning"]["data_dir"]
    with tempfile.TemporaryDirectory() as tmp:
        for name in ("projector_pca.npz", "projector_embedding_version.txt"):
            shutil.copy(src_dir / name, Path(tmp) / name)
        lay = UserLayoutService(AI_ROOT, cfg, device=device, data_dir=Path(tmp))
        embs = lay.encoder.encode(texts)
        placed = [lay.add(FAKE_USER, did, text) for did, text in items]
        versions = {"embedding_version": lay.embedding_version, "layout_version": lay.layout_version}
        del lay

    rows = []
    for (did, text), p, a, e, pl in zip(items, probs, analyzed, embs, placed):
        e32 = np.asarray(e, np.float32)
        rows.append({
            "id": did,
            "chars": len(text),
            "probs": [round(float(x), 6) for x in p],
            "emotion": a["emotion"],
            "planet_v01": a["planet"],
            "visual": a["visual"],
            "star": a["star"],
            "embedding": {"sha256_r4": hashlib.sha256(np.round(e32, 4).tobytes()).hexdigest()[:16],
                          "head": [round(float(x), 5) for x in e32[:8]], "norm": round(float(np.linalg.norm(e32)), 5)},
            "layout": {"star": {k: round(v, 5) for k, v in pl["star"].items()}, "rule": pl["rule"],
                       "related": pl["related"]},
        })
    out = {"models": pipe.model_names, "mapping_version": pipe.mapping["version"], "visual_version": pipe.visual["version"],
           **versions, "device": device, "n": len(rows), "rows": rows}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"recorded {len(rows)} diaries → {out_path}")


def sizes(out_path: Path) -> None:
    """backend 폴더에서 backend 가상환경으로 실행: 백엔드 크기 규칙(_star_size_for_content) 값을 기록."""
    sys.path.insert(0, str(Path.cwd()))
    from app.routers.diaries import _star_size_for_content
    out = {did: round(_star_size_for_content(text), 6) for did, text in regression_texts()}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"sizes {len(out)} → {out_path}")


def _diff(a, b, path: str, tol: float, out: list[str]) -> None:
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}.{k}: {'추가' if k not in a else '삭제'}")
            else:
                _diff(a[k], b[k], f"{path}.{k}", tol, out)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: 길이 {len(a)} → {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(x, y, f"{path}[{i}]", tol, out)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        if abs(a - b) > tol:
            out.append(f"{path}: {a} → {b}")
    elif a != b:
        out.append(f"{path}: {a!r} → {b!r}")


def compare(before: Path, after: Path, tol: float = 1e-4) -> int:
    A = json.loads(before.read_text(encoding="utf-8"))
    B = json.loads(after.read_text(encoding="utf-8"))
    diffs: list[str] = []
    for k in ("models", "mapping_version", "visual_version", "embedding_version", "layout_version", "n"):
        if A.get(k) != B.get(k):
            diffs.append(f"{k}: {A.get(k)!r} → {B.get(k)!r}")
    rb = {r["id"]: r for r in B["rows"]}
    sections = ("probs", "emotion", "planet_v01", "visual", "star", "embedding", "layout")
    per_section = {s: 0 for s in sections}
    for r in A["rows"]:
        s = rb.get(r["id"])
        if s is None:
            diffs.append(f"{r['id']}: 없음")
            continue
        for sec in sections:
            d: list[str] = []
            # 임베딩 해시는 GPU 연산 순서에 따라 4자리 반올림 경계에서 달라질 수 있어 head·norm 값으로 비교한다
            _diff({k: v for k, v in r[sec].items() if k != "sha256_r4"} if sec == "embedding" else r[sec],
                  {k: v for k, v in s[sec].items() if k != "sha256_r4"} if sec == "embedding" else s[sec],
                  f"{r['id']}.{sec}", tol, d)
            per_section[sec] += bool(d)
            diffs += d
    for name in ("sizes",):
        if name in A and name in B:
            for k in A[name]:
                if abs(A[name][k] - B[name].get(k, -1)) > 1e-9:
                    diffs.append(f"size {k}: {A[name][k]} → {B[name].get(k)}")
    print(f"비교 {len(A['rows'])}개 일기, 허용 오차 {tol}")
    for sec, n in per_section.items():
        print(f"  {sec:11s} 달라진 일기 {n}")
    print(f"  차이 {len(diffs)}건")
    for d in diffs[:30]:
        print("   -", d)
    return 1 if diffs else 0


def merge_sizes(record_path: Path, sizes_path: Path) -> None:
    rec = json.loads(record_path.read_text(encoding="utf-8"))
    rec["sizes"] = json.loads(sizes_path.read_text(encoding="utf-8"))
    record_path.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"merged {len(rec['sizes'])} sizes into {record_path}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "record":
        record(Path(sys.argv[2]))
    elif cmd == "sizes":
        sizes(Path(sys.argv[2]))
    elif cmd == "merge-sizes":
        merge_sizes(Path(sys.argv[2]), Path(sys.argv[3]))
    elif cmd == "compare":
        sys.exit(compare(Path(sys.argv[2]), Path(sys.argv[3])))
    else:
        raise SystemExit(__doc__)
