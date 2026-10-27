"""학습된 감정 분류 모델로 텍스트의 44개 감정 확률을 계산한다.

체크포인트 폴더 구성(ai/scripts/train_emotion_baseline.py가 저장):
    model.safetensors, config.json, tokenizer 파일, thresholds.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from .data import make_collate
from .text import prepare_text
from .train import amp_context


class EmotionPredictor:
    def __init__(self, checkpoint_dir: Path, device: str | None = None, threshold_kind: str = "per_label"):
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.dir = Path(checkpoint_dir)
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.dir))
        self.model = AutoModelForSequenceClassification.from_pretrained(str(self.dir)).to(self.device).eval()
        th = json.loads((self.dir / "thresholds.json").read_text(encoding="utf-8"))
        # 다중 과제 모델은 출력 뒤쪽에 행성 그룹 출력이 붙어 있으므로 감정 라벨 수만큼만 쓴다.
        n_out = self.model.config.num_labels
        self.labels = th.get("labels") or [self.model.config.id2label[i] for i in range(n_out)]
        self.groups = th.get("groups", []) if n_out > len(self.labels) else []
        self.max_length = th["max_length"]
        self.thresholds = np.asarray(
            th["per_label"] if threshold_kind == "per_label" else [th[threshold_kind]] * len(self.labels))
        self.precision = "bf16" if self.device.type == "cuda" else "fp32"
        self._collate = make_collate(self.tokenizer.pad_token_id)

    @torch.no_grad()
    def predict_proba(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        out = []
        for i in range(0, len(texts), batch_size):
            chunk = [prepare_text(t) for t in texts[i:i + batch_size]]
            ids = self.tokenizer(chunk, add_special_tokens=True, truncation=True,
                                 max_length=self.max_length)["input_ids"]
            batch = self._collate([(x, np.zeros(len(self.labels), np.float32)) for x in ids])
            with amp_context(self.device, self.precision):
                logits = self.model(input_ids=batch["input_ids"].to(self.device),
                                    attention_mask=batch["attention_mask"].to(self.device)).logits
            out.append(torch.sigmoid(logits.float()).cpu().numpy())
        return np.concatenate(out)[:, :len(self.labels)]

    @torch.no_grad()
    def predict_group_proba(self, texts: list[str], batch_size: int = 64) -> np.ndarray | None:
        """그룹 출력이 있는 다중 과제 모델이면 (N, 그룹 수) 확률, 아니면 None."""
        if not self.groups:
            return None
        out = []
        for i in range(0, len(texts), batch_size):
            chunk = [prepare_text(t) for t in texts[i:i + batch_size]]
            ids = self.tokenizer(chunk, add_special_tokens=True, truncation=True, max_length=self.max_length)["input_ids"]
            batch = self._collate([(x, np.zeros(1, np.float32)) for x in ids])
            with amp_context(self.device, self.precision):
                logits = self.model(input_ids=batch["input_ids"].to(self.device),
                                    attention_mask=batch["attention_mask"].to(self.device)).logits
            out.append(torch.sigmoid(logits.float()).cpu().numpy()[:, len(self.labels):])
        return np.concatenate(out)

    def predict(self, texts: list[str], top_k: int = 5) -> list[dict]:
        probs = self.predict_proba(texts)
        results = []
        for p in probs:
            order = np.argsort(-p)
            results.append({
                "probs": {self.labels[j]: float(p[j]) for j in range(len(self.labels))},
                "top": [(self.labels[j], float(p[j])) for j in order[:top_k]],
                "predicted": [self.labels[j] for j in order if p[j] >= self.thresholds[j]],
            })
        return results
