"""임베딩 모델 1개의 로딩 시간·메모리(CPU RSS, GPU 할당량)·추론 시간을 **새 프로세스**에서 잰다.

같은 프로세스에서 모델을 차례로 올리고 내리면, 앞 모델이 쓰던 메모리를 다음 모델이 재사용해
메모리 증가량이 실제보다 작게 보인다. 그래서 모델마다 이 스크립트를 따로 실행해 결과(JSON)를 모은다.

사용 예 (저장소 루트에서):
    .venv/Scripts/python ai/scripts/measure_embedding_resources.py --model kure_v1
출력: 표준출력 마지막 줄에 JSON 한 줄
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402


def mem() -> dict:
    import psutil
    mi = psutil.Process(os.getpid()).memory_info()
    return {"rss_mb": mi.rss / 2**20, "peak_mb": getattr(mi, "peak_wset", mi.rss) / 2**20}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()

    P = get_paths(AI_ROOT)
    configure_hf_cache(P)
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    exp = load_json(P.configs / "step2_experiment.json")
    models_cfg = load_json(P.configs / "embedding_models.json")
    texts = [d["text"] for d in load_json(P.configs / exp["dataset"])["diaries"]]

    t0 = time.perf_counter()
    import torch  # noqa: F401  (라이브러리 import 시간·메모리는 모델 로딩과 분리)
    import transformers  # noqa: F401
    from transformers import AutoModel, AutoTokenizer  # noqa: F401
    from src.embedding.encoders import TextEncoder, load_specs, time_encoding
    t_import = time.perf_counter() - t0
    m1 = mem()

    spec = load_specs(models_cfg)[args.model]
    device = models_cfg["device"]
    cuda = device.startswith("cuda")
    if cuda:
        torch.cuda.reset_peak_memory_stats()
    enc = TextEncoder(spec, device=device, batch_size=models_cfg["batch_size"]).load()
    m2 = mem()
    gpu_after_load = torch.cuda.memory_allocated() / 2**20 if cuda else None
    timing = time_encoding(enc, texts, **exp["timing"])
    m3 = mem()
    gpu = {}
    if cuda:
        gpu = {"gpu_name": torch.cuda.get_device_name(0), "gpu_alloc_after_load_MB": gpu_after_load,
               "gpu_peak_alloc_MB": torch.cuda.max_memory_allocated() / 2**20,
               "gpu_peak_reserved_MB": torch.cuda.max_memory_reserved() / 2**20}
    out = {
        "model": args.model, "model_id": spec.model_id, "embedding_version": enc.embedding_version,
        "params_M": enc.stats.n_params / 1e6, "weights_fp32_MB": enc.stats.n_params * 4 / 2**20,
        "import_s": t_import, "load_s": enc.stats.load_s,
        "rss_base_MB": m1["rss_mb"], "rss_after_load_MB": m2["rss_mb"], "rss_after_encode_MB": m3["rss_mb"],
        "load_increase_MB": m2["rss_mb"] - m1["rss_mb"], "peak_MB": m3["peak_mb"],
        "device": device, "torch_threads": enc.stats.torch_threads, **gpu, **timing,
    }
    out.pop("rss_after_encode_mb", None)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
