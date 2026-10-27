"""KcELECTRA 다중 라벨 감정 분류 학습·추론 루프 (PyTorch)."""
from __future__ import annotations

import math
import random
import time

import numpy as np
import torch


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def build_model(model_cfg: dict, label_names: list[str]):
    from transformers import AutoModelForSequenceClassification

    return AutoModelForSequenceClassification.from_pretrained(
        model_cfg["repo_id"],
        revision=model_cfg["revision"],
        num_labels=len(label_names),
        problem_type="multi_label_classification",
        id2label=dict(enumerate(label_names)),
        label2id={n: i for i, n in enumerate(label_names)},
    )


def build_optimizer(model, lr: float, weight_decay: float):
    decay, no_decay = [], []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        (no_decay if p.ndim < 2 or "LayerNorm" in name or name.endswith(".bias") else decay).append(p)
    return torch.optim.AdamW(
        [{"params": decay, "weight_decay": weight_decay}, {"params": no_decay, "weight_decay": 0.0}], lr=lr)


def amp_context(device: torch.device, precision: str):
    if device.type == "cuda" and precision == "bf16":
        return torch.autocast("cuda", dtype=torch.bfloat16)
    if device.type == "cuda" and precision == "fp16":
        return torch.autocast("cuda", dtype=torch.float16)
    return torch.autocast(device.type, enabled=False)


def bce_loss(logits: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
    return torch.nn.functional.binary_cross_entropy_with_logits(logits.float(), labels.float())


def make_multitask_loss(n_labels: int, group_weight: float = 1.0):
    """앞 n_labels개 출력은 감정 라벨, 나머지는 행성 그룹. 각각 평균 BCE를 구해 가중합한다.

    목표값은 0/1(공식 라벨) 또는 0~1(평가자 투표 비율, soft label) 모두 가능하다.
    """
    def loss_fn(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        loss = bce_loss(logits[:, :n_labels], targets[:, :n_labels])
        if logits.shape[1] > n_labels:
            loss = loss + group_weight * bce_loss(logits[:, n_labels:], targets[:, n_labels:])
        return loss
    return loss_fn


def train_one_epoch(model, loader, optimizer, scheduler, device, precision: str, max_grad_norm: float,
                    accum_steps: int = 1, log_every: int = 200, max_steps: int | None = None, log=print,
                    loss_fn=bce_loss) -> float:
    """loader의 micro-batch를 accum_steps개씩 모아 한 번 업데이트한다(실효 배치 = micro × accum).

    log_every, max_steps는 옵티마이저 업데이트 횟수 기준이다.
    """
    model.train()
    total, n, t0, step = 0.0, 0, time.time(), 0
    n_updates = math.ceil(len(loader) / accum_steps)
    optimizer.zero_grad(set_to_none=True)
    for i, batch in enumerate(loader, 1):
        batch = {k: v.to(device, non_blocking=True) for k, v in batch.items()}
        with amp_context(device, precision):
            logits = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"]).logits
        loss = loss_fn(logits, batch["labels"])
        if not math.isfinite(loss.item()):
            raise FloatingPointError(f"loss가 {loss.item()}입니다 (micro-batch {i}).")
        # 마지막 묶음이 accum_steps보다 작아도 평균이 맞도록 실제 묶음 크기로 나눈다
        group = min(accum_steps, len(loader) - (step * accum_steps))
        (loss / group).backward()
        total += loss.item() * len(batch["labels"])
        n += len(batch["labels"])
        if i % accum_steps == 0 or i == len(loader):
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad(set_to_none=True)
            step += 1
            if step % log_every == 0:
                log(f"  step {step}/{n_updates} loss {total / n:.4f} lr {scheduler.get_last_lr()[0]:.2e} "
                    f"{(time.time() - t0) / step:.3f}s/step")
            if max_steps and step >= max_steps:
                break
    return total / max(n, 1)


@torch.no_grad()
def predict_probs(model, loader, device, precision: str, loss_fn=bce_loss) -> tuple[np.ndarray, float]:
    """시그모이드 확률(N, L)과 평균 BCE loss."""
    model.eval()
    probs, total, n = [], 0.0, 0
    for batch in loader:
        batch = {k: v.to(device, non_blocking=True) for k, v in batch.items()}
        with amp_context(device, precision):
            logits = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"]).logits
        total += loss_fn(logits, batch["labels"]).item() * len(batch["labels"])
        n += len(batch["labels"])
        probs.append(torch.sigmoid(logits.float()).cpu().numpy())
    return np.concatenate(probs), total / max(n, 1)
