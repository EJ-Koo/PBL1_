"""토크나이저 파일만 내려받아 토큰 길이를 측정한다(모델 가중치는 받지 않음).

paths.configure_hf_cache()를 먼저 호출해야 캐시가 ai/.cache/ 아래에 저장된다.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

WEIGHT_PATTERNS = ["*.bin", "*.safetensors", "*.pt", "*.pth", "*.ckpt", "*.onnx", "*.h5", "*.msgpack"]


def download_tokenizer_files(repo_id: str, revision: str, allow_patterns: list[str]) -> Path:
    from huggingface_hub import snapshot_download

    local = snapshot_download(
        repo_id=repo_id,
        revision=revision,
        allow_patterns=allow_patterns,
        ignore_patterns=WEIGHT_PATTERNS,
    )
    path = Path(local)
    weights = [p.name for pat in WEIGHT_PATTERNS for p in path.glob(pat)]
    if weights:
        raise RuntimeError(f"가중치 파일이 내려받아졌습니다: {weights}")
    return path


def load_tokenizer(local_dir: Path):
    from transformers import AutoTokenizer

    return AutoTokenizer.from_pretrained(str(local_dir))


def token_lengths(tokenizer, texts: list[str], batch_size: int = 2048) -> np.ndarray:
    """특수 토큰([CLS], [SEP])을 포함하고 truncation 없이 측정한 토큰 수."""
    out = []
    for i in range(0, len(texts), batch_size):
        enc = tokenizer(texts[i:i + batch_size], add_special_tokens=True, truncation=False)
        out.extend(len(ids) for ids in enc["input_ids"])
    return np.asarray(out, dtype=np.int64)
