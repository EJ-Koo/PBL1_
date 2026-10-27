"""문장 임베딩 모델 wrapper.

각 모델 카드의 공식 사용법(pooling·정규화·prefix·최대 길이)을 transformers로 그대로 구현한다.
sentence-transformers 없이 같은 계산을 한다:
    CLS pooling      : last_hidden_state[:, 0]
    mean pooling     : attention mask로 가린 토큰 평균
    normalize        : L2 정규화 → 내적 = 코사인 유사도
모델 학습·미세조정은 하지 않는다(torch.inference_mode).

메모리를 아끼기 위해 모델은 한 번에 하나만 올리고, 다 쓰면 close()로 내린다.
"""
from __future__ import annotations

import gc
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np


def process_rss_mb() -> float | None:
    """현재 프로세스 상주 메모리(RSS, MB). psutil이 없으면 None."""
    try:
        import psutil
    except ImportError:
        return None
    return psutil.Process(os.getpid()).memory_info().rss / 2**20


@dataclass(frozen=True)
class EncoderSpec:
    key: str
    model_id: str
    revision: str
    pooling: str            # "cls" | "mean"
    normalize: bool
    prefix: str
    max_length: int
    dim: int
    allow_patterns: tuple[str, ...] = ()
    license: str = ""

    @property
    def embedding_version(self) -> str:
        """저장 좌표·임베딩에 함께 기록하는 버전 문자열. 모델·리비전·전처리가 바뀌면 달라진다."""
        return f"{self.key}:{self.model_id}@{self.revision[:12]}:{self.pooling}:{'l2' if self.normalize else 'raw'}"

    @classmethod
    def from_config(cls, key: str, cfg: dict) -> "EncoderSpec":
        return cls(
            key=key, model_id=cfg["model_id"], revision=cfg["revision"], pooling=cfg["pooling"],
            normalize=bool(cfg["normalize"]), prefix=cfg.get("prefix", ""), max_length=int(cfg["max_length"]),
            dim=int(cfg["dim"]), allow_patterns=tuple(cfg.get("allow_patterns", ())), license=cfg.get("license", ""),
        )


def load_specs(models_cfg: dict) -> dict[str, EncoderSpec]:
    return {k: EncoderSpec.from_config(k, v) for k, v in models_cfg["models"].items()}


def download_model(spec: EncoderSpec) -> Path:
    """고정 리비전의 필요한 파일만 HF 캐시(ai/.cache, Git 제외)에 받는다. 이미 있으면 재사용."""
    from huggingface_hub import snapshot_download

    kw = dict(repo_id=spec.model_id, revision=spec.revision, allow_patterns=list(spec.allow_patterns) or None)
    try:   # 이미 받은 파일이 있으면 네트워크 없이 사용
        return Path(snapshot_download(**kw, local_files_only=True))
    except Exception:
        return Path(snapshot_download(**kw))


@dataclass
class LoadStats:
    download_s: float
    load_s: float
    rss_before_mb: float | None
    rss_after_load_mb: float | None
    n_params: int
    torch_threads: int


@dataclass
class TextEncoder:
    """한 모델을 CPU에 올려 텍스트 → 정규화 임베딩(np.float32)을 만든다."""

    spec: EncoderSpec
    device: str = "cpu"
    batch_size: int = 16
    stats: LoadStats | None = None
    n_truncated: int = 0
    _model: object = field(default=None, repr=False)
    _tok: object = field(default=None, repr=False)

    def load(self) -> "TextEncoder":
        import torch
        from transformers import AutoModel, AutoTokenizer

        rss0 = process_rss_mb()
        t0 = time.perf_counter()
        local = download_model(self.spec)
        t1 = time.perf_counter()
        self._tok = AutoTokenizer.from_pretrained(local)
        self._model = AutoModel.from_pretrained(local, dtype=torch.float32).to(self.device).eval()
        t2 = time.perf_counter()
        self.stats = LoadStats(
            download_s=t1 - t0, load_s=t2 - t1, rss_before_mb=rss0, rss_after_load_mb=process_rss_mb(),
            n_params=sum(p.numel() for p in self._model.parameters()), torch_threads=torch.get_num_threads(),
        )
        return self

    @property
    def embedding_version(self) -> str:
        return self.spec.embedding_version

    def encode(self, texts: list[str], batch_size: int | None = None) -> np.ndarray:
        """텍스트 목록 → (n, dim) float32. normalize=True면 각 행의 L2 노름은 1."""
        import torch

        if self._model is None:
            raise RuntimeError("load()를 먼저 호출하세요.")
        bs = batch_size or self.batch_size
        out = []
        with torch.inference_mode():
            for i in range(0, len(texts), bs):
                chunk = [self.spec.prefix + t for t in texts[i:i + bs]]
                full = self._tok(chunk, add_special_tokens=True)["input_ids"]
                self.n_truncated += sum(len(x) > self.spec.max_length for x in full)
                enc = self._tok(chunk, padding=True, truncation=True, max_length=self.spec.max_length,
                                return_tensors="pt").to(self.device)
                hidden = self._model(**enc).last_hidden_state
                if self.spec.pooling == "cls":
                    emb = hidden[:, 0]
                elif self.spec.pooling == "mean":
                    mask = enc["attention_mask"].unsqueeze(-1).to(hidden.dtype)
                    emb = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
                else:
                    raise ValueError(f"알 수 없는 pooling: {self.spec.pooling}")
                if self.spec.normalize:
                    emb = torch.nn.functional.normalize(emb, p=2, dim=1)
                out.append(emb.float().cpu().numpy())
        return np.concatenate(out, axis=0).astype(np.float32) if out else np.zeros((0, self.spec.dim), np.float32)

    def token_lengths(self, texts: list[str]) -> list[int]:
        """prefix·특수 토큰 포함 토큰 수(잘림 여부 확인용)."""
        return [len(x) for x in self._tok([self.spec.prefix + t for t in texts])["input_ids"]]

    def close(self) -> None:
        """모델을 메모리에서 내린다(다음 모델을 올리기 전 호출)."""
        self._model = None
        self._tok = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def time_encoding(enc: TextEncoder, texts: list[str], n_warmup: int = 3, n_single: int = 20) -> dict:
    """워밍업 후 (1) 일기 1개씩 인코딩 지연시간, (2) 전체 묶음 처리량을 잰다."""
    # GPU에서도 encode()가 결과를 CPU로 복사(.cpu())하므로 각 측정은 GPU 계산이 끝난 뒤의 시간이다.
    for t in texts[:n_warmup]:
        enc.encode([t], batch_size=1)
    singles = []
    for t in texts[:n_single]:
        t0 = time.perf_counter()
        enc.encode([t], batch_size=1)
        singles.append((time.perf_counter() - t0) * 1000)
    t0 = time.perf_counter()
    enc.encode(texts)
    batch_s = time.perf_counter() - t0
    return {
        "single_ms_median": float(np.median(singles)),
        "single_ms_p90": float(np.percentile(singles, 90)),
        "n_single": len(singles),
        "batch_total_s": batch_s,
        "batch_ms_per_text": batch_s * 1000 / max(len(texts), 1),
        "n_batch": len(texts),
        "rss_after_encode_mb": process_rss_mb(),
    }
