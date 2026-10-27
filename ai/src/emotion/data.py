"""학습 입력: processed KOTE(parquet + multi-hot npy)를 토큰화하고 동적 패딩으로 배치를 만든다."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from .text import prepare_text


def load_processed_split(processed_dir: Path, split: str) -> tuple[pd.DataFrame, np.ndarray]:
    df = pd.read_parquet(Path(processed_dir) / f"{split}.parquet")
    y = np.load(Path(processed_dir) / f"{split}_multihot.npy")
    if len(df) != len(y):
        raise ValueError(f"{split}: parquet {len(df)}행과 multi-hot {len(y)}행이 다릅니다.")
    return df, y


def encode_texts(tokenizer, texts: list[str], max_length: int) -> tuple[list[list[int]], int]:
    """특수 토큰 포함, max_length에서 자른 input_ids와 잘린 샘플 수를 반환한다."""
    texts = [prepare_text(t) for t in texts]
    full = tokenizer(texts, add_special_tokens=True, truncation=False)["input_ids"]
    n_truncated = sum(len(x) > max_length for x in full)
    ids = [x if len(x) <= max_length else x[: max_length - 1] + [tokenizer.sep_token_id] for x in full]
    return ids, n_truncated


class MultiLabelDataset(Dataset):
    def __init__(self, input_ids: list[list[int]], labels: np.ndarray):
        assert len(input_ids) == len(labels)
        self.input_ids = input_ids
        self.labels = labels.astype(np.float32)

    def __len__(self):
        return len(self.input_ids)

    def __getitem__(self, i):
        return self.input_ids[i], self.labels[i]


def make_collate(pad_id: int):
    """배치 안의 최장 길이까지만 패딩한다(동적 패딩)."""
    def collate(batch):
        ids, labels = zip(*batch)
        width = max(len(x) for x in ids)
        input_ids = torch.full((len(ids), width), pad_id, dtype=torch.long)
        attention = torch.zeros((len(ids), width), dtype=torch.long)
        for i, x in enumerate(ids):
            input_ids[i, : len(x)] = torch.tensor(x, dtype=torch.long)
            attention[i, : len(x)] = 1
        return {"input_ids": input_ids, "attention_mask": attention,
                "labels": torch.from_numpy(np.stack(labels))}
    return collate
