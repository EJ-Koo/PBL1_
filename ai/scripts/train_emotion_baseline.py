"""KOTE 감정 분류 베이스라인 학습 (KcELECTRA v2021, 44 라벨 다중 분류).

사전 조건: 01_data_analysis 노트북을 실행해 ai/data/processed/kote/ 가 있어야 한다.

저장 위치 (모두 Git 제외)
- 모델: ai/checkpoints/emotion_baseline/<run_id>/   (가중치·토크나이저·thresholds.json)
- 결과: ai/outputs/emotion/<run_id>/                (history.csv, metrics.json, 예측 확률 등)

사용 예 (저장소 루트):
    .venv/Scripts/python ai/scripts/train_emotion_baseline.py --smoke   # 동작 확인(짧게)
    .venv/Scripts/python ai/scripts/train_emotion_baseline.py           # 전체 학습
"""
from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402

P = get_paths(AI_ROOT)
configure_hf_cache(P)  # transformers import 전에 캐시 위치 지정

import os  # noqa: E402

# 캐시 단편화를 줄여 GPU 메모리 사용량이 계속 커지지 않게 한다(torch import 전에 설정해야 적용됨).
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "garbage_collection_threshold:0.8,max_split_size_mb:256")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
from torch.utils.data import DataLoader  # noqa: E402
from transformers import AutoTokenizer, get_linear_schedule_with_warmup  # noqa: E402

from src.data.labels import load_label_names  # noqa: E402
from src.emotion import metrics as M  # noqa: E402
from src.emotion.data import MultiLabelDataset, encode_texts, load_processed_split, make_collate  # noqa: E402
from src.emotion.train import (bce_loss, build_model, build_optimizer, amp_context,  # noqa: E402
                               predict_probs, set_seed, train_one_epoch)

SPLITS = ("train", "validation", "test")


def log(msg: str, fh=None):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if fh:
        fh.write(line + "\n")
        fh.flush()


def check_longest_batch(model, ds, collate, batch_size, device, precision):
    """가장 긴 샘플들로 만든 배치 1개로 forward/backward를 돌려 GPU 메모리 부족을 미리 확인한다."""
    order = np.argsort([-len(x) for x in ds.input_ids])[:batch_size]
    batch = collate([ds[i] for i in order])
    batch = {k: v.to(device) for k, v in batch.items()}
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()
    model.train()
    with amp_context(device, precision):
        logits = model(input_ids=batch["input_ids"], attention_mask=batch["attention_mask"]).logits
    bce_loss(logits, batch["labels"]).backward()
    model.zero_grad(set_to_none=True)
    width = batch["input_ids"].shape[1]
    peak = torch.cuda.max_memory_allocated() / 2**30 if device.type == "cuda" else float("nan")
    return width, peak


def save_with_retry(save_fn, desc: str, tries: int = 5, wait: float = 10.0, fh=None):
    """OneDrive 등 동기화 프로그램이 파일을 잠깐 잠그면 PermissionError가 날 수 있어 몇 번 다시 시도한다."""
    for k in range(1, tries + 1):
        try:
            return save_fn()
        except PermissionError as e:
            if k == tries:
                raise
            log(f"{desc} 저장 실패({e.__class__.__name__}), {wait:.0f}초 후 재시도 {k}/{tries - 1}", fh)
            time.sleep(wait)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=AI_ROOT / "configs" / "emotion_baseline.json")
    ap.add_argument("--smoke", action="store_true", help="짧은 동작 확인: 학습 60 step, 평가 일부")
    ap.add_argument("--run-id", default=None)
    args = ap.parse_args()

    cfg = load_json(args.config)
    tcfg, mcfg, dcfg, ecfg = cfg["train"], cfg["model"], cfg["data"], cfg["eval"]
    run_id = args.run_id or (("smoke_" if args.smoke else "") + datetime.now().strftime("%Y%m%d_%H%M%S"))
    out_dir = P.ai_root / "outputs" / "emotion" / run_id
    ckpt_dir = P.checkpoints / "emotion_baseline" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    fh = open(out_dir / "train.log", "a", encoding="utf-8")

    set_seed(tcfg["seed"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    precision = tcfg["precision"] if device.type == "cuda" else "fp32"
    gpu = torch.cuda.get_device_name(0) if device.type == "cuda" else "-"
    if device.type == "cuda" and tcfg.get("max_gpu_mem_gib"):
        total_gib = torch.cuda.get_device_properties(0).total_memory / 2**30
        torch.cuda.set_per_process_memory_fraction(min(1.0, tcfg["max_gpu_mem_gib"] / total_gib))
        log(f"GPU 메모리 상한 {tcfg['max_gpu_mem_gib']} GiB / 전체 {total_gib:.1f} GiB", fh)
    log(f"run_id={run_id} device={device} ({gpu}) precision={precision} torch={torch.__version__}", fh)

    # ---------------- 데이터
    labels = load_label_names(P.configs / "kote_labels.json")
    if not (P.processed_kote / "train.parquet").exists():
        raise FileNotFoundError("ai/data/processed/kote/가 없습니다. 먼저 01_data_analysis 노트북을 실행하세요.")
    tok = AutoTokenizer.from_pretrained(mcfg["repo_id"], revision=mcfg["revision"])
    data = {}
    for s in SPLITS:
        df, y = load_processed_split(P.processed_kote, s)
        if args.smoke and s != "train":
            df, y = df.iloc[:512], y[:512]
        ids, n_trunc = encode_texts(tok, df["text"].tolist(), dcfg["max_length"])
        data[s] = {"ids": df["ID"].tolist(), "ds": MultiLabelDataset(ids, y), "y": y}
        log(f"{s}: {len(df)}개, max_length {dcfg['max_length']} 초과로 잘린 샘플 {n_trunc}개", fh)

    collate = make_collate(tok.pad_token_id)
    g = torch.Generator().manual_seed(tcfg["seed"])
    micro = tcfg.get("micro_batch_size") or tcfg["batch_size"]
    if tcfg["batch_size"] % micro:
        raise ValueError("batch_size는 micro_batch_size의 배수여야 합니다.")
    accum = tcfg["batch_size"] // micro
    train_loader = DataLoader(data["train"]["ds"], batch_size=micro, shuffle=True,
                              collate_fn=collate, generator=g, num_workers=tcfg["num_workers"])
    eval_loaders = {s: DataLoader(data[s]["ds"], batch_size=tcfg["eval_batch_size"], shuffle=False,
                                  collate_fn=collate) for s in ("validation", "test")}

    # ---------------- 모델
    model = build_model(mcfg, labels).to(device)
    if tcfg.get("gradient_checkpointing"):
        model.gradient_checkpointing_enable()
    n_params = sum(p.numel() for p in model.parameters())
    log(f"모델 {mcfg['repo_id']}@{mcfg['revision_name']} 파라미터 {n_params / 1e6:.1f}M", fh)
    width, peak = check_longest_batch(model, data["train"]["ds"], collate, micro, device, precision)
    log(f"최장 micro-batch 점검: 길이 {width}, batch {micro}, 최대 GPU 메모리 {peak:.2f} GiB "
        f"(옵티마이저 상태 약 {2 * n_params * 4 / 2**30:.1f} GiB 별도)", fh)
    log(f"실효 batch {tcfg['batch_size']} = micro {micro} × 누적 {accum}, "
        f"gradient checkpointing {'사용' if tcfg.get('gradient_checkpointing') else '미사용'}", fh)

    epochs = 1 if args.smoke else tcfg["epochs"]
    max_steps = 60 if args.smoke else None
    import math
    updates_per_epoch = math.ceil(len(train_loader) / accum)
    steps_per_epoch = min(updates_per_epoch, max_steps or updates_per_epoch)
    total_steps = steps_per_epoch * epochs
    optimizer = build_optimizer(model, tcfg["learning_rate"], tcfg["weight_decay"])
    scheduler = get_linear_schedule_with_warmup(optimizer, int(total_steps * tcfg["warmup_ratio"]), total_steps)
    log(f"epochs {epochs}, steps/epoch {steps_per_epoch}, total {total_steps}, warmup {int(total_steps * tcfg['warmup_ratio'])}", fh)

    # ---------------- 학습
    thr0 = ecfg["paper_threshold"]
    history, best, bad, t_start = [], -1.0, 0, time.time()
    best_state = None  # 최고 epoch 가중치는 메모리(CPU)에 보관하고 학습 종료 후 한 번만 저장
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        tr_loss = train_one_epoch(model, train_loader, optimizer, scheduler, device, precision,
                                  tcfg["max_grad_norm"], accum_steps=accum, log_every=50 if args.smoke else 250,
                                  max_steps=max_steps, log=lambda m: log(m, fh))
        if device.type == "cuda":
            torch.cuda.empty_cache()  # 학습 중 쌓인 캐시를 비워 평가 시 공유 메모리로 넘치지 않게 함
        vp, v_loss = predict_probs(model, eval_loaders["validation"], device, precision)
        if device.type == "cuda":
            torch.cuda.empty_cache()
        vm = M.multilabel_metrics(data["validation"]["y"], vp, thr0)
        row = {"epoch": epoch, "train_loss": tr_loss, "val_loss": v_loss, "val_macro_f1@0.3": vm["macro_f1"],
               "val_micro_f1@0.3": vm["micro_f1"], "val_macro_auc": vm["macro_roc_auc"],
               "epoch_sec": time.time() - t0}
        history.append(row)
        pd.DataFrame(history).to_csv(out_dir / "history.csv", index=False)
        improved = vm["macro_f1"] > best
        log(f"epoch {epoch}: train_loss {tr_loss:.4f} val_loss {v_loss:.4f} "
            f"val macro-F1@0.3 {vm['macro_f1']:.4f} micro-F1 {vm['micro_f1']:.4f} AUC {vm['macro_roc_auc']:.4f} "
            f"({row['epoch_sec']:.0f}s){' *best' if improved else ''}", fh)
        if improved:
            best, bad = vm["macro_f1"], 0
            best_state = {k: v.detach().to("cpu", copy=True) for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= tcfg["early_stopping_patience"]:
                log(f"조기 종료: {bad} epoch 연속 개선 없음", fh)
                break
    train_sec = time.time() - t_start

    # ---------------- 최고 epoch 가중치 저장 (safetensors)
    model.load_state_dict(best_state)
    if ckpt_dir.exists() and any(ckpt_dir.iterdir()):
        raise FileExistsError(f"{ckpt_dir}에 이미 파일이 있습니다. 다른 --run-id를 쓰세요.")
    save_with_retry(lambda: model.save_pretrained(ckpt_dir), "모델", fh=fh)
    save_with_retry(lambda: tok.save_pretrained(ckpt_dir), "토크나이저", fh=fh)
    log(f"최고 epoch 모델 저장: {ckpt_dir.relative_to(P.repo_root).as_posix()}", fh)

    # ---------------- 최종 평가 (최고 epoch 모델)
    from transformers import AutoModelForSequenceClassification
    model = AutoModelForSequenceClassification.from_pretrained(ckpt_dir).to(device)
    probs = {}
    if device.type == "cuda":
        torch.cuda.empty_cache()
    for s in ("validation", "test"):
        probs[s], _ = predict_probs(model, eval_loaders[s], device, precision)
        np.save(out_dir / f"{s}_probs.npy", probs[s].astype(np.float32))
        np.save(out_dir / f"{s}_labels.npy", data[s]["y"].astype(np.float32))
        pd.Series(data[s]["ids"], name="ID").to_csv(out_dir / f"{s}_ids.csv", index=False)

    grid = M.threshold_grid(**ecfg["threshold_grid"])
    yv, yt = data["validation"]["y"], data["test"]["y"]
    g_thr, g_val = M.tune_global_threshold(yv, probs["validation"], grid)
    pl_thr = M.tune_per_label_thresholds(yv, probs["validation"], grid)
    strategies = {"paper_0.3": thr0, "global_tuned": g_thr, "per_label_tuned": pl_thr}
    results = {name: {s: M.multilabel_metrics(data[s]["y"], probs[s], t) for s in ("validation", "test")}
               for name, t in strategies.items()}

    per_label = M.per_label_counts(yt, M.binarize(probs["test"], pl_thr))
    per_label_03 = M.per_label_counts(yt, M.binarize(probs["test"], thr0))
    auc = M.roc_auc_per_label(yt, probs["test"])
    pd.DataFrame({
        "label_id": range(len(labels)), "label": labels, "support_test": per_label["support"],
        "threshold": pl_thr, "precision": per_label["precision"], "recall": per_label["recall"],
        "f1": per_label["f1"], "f1@0.3": per_label_03["f1"], "roc_auc": auc,
    }).to_csv(out_dir / "per_label_test.csv", index=False, encoding="utf-8-sig")

    thresholds = {"max_length": dcfg["max_length"], "paper_0.3": thr0, "global_tuned": g_thr,
                  "per_label": [float(x) for x in pl_thr], "labels": labels,
                  "tuned_on": "validation"}
    save_with_retry(lambda: (ckpt_dir / "thresholds.json").write_text(
        json.dumps(thresholds, ensure_ascii=False, indent=1), encoding="utf-8"), "thresholds", fh=fh)
    (out_dir / "thresholds.json").write_text(json.dumps(thresholds, ensure_ascii=False, indent=1), encoding="utf-8")

    best_row = max(history, key=lambda r: r["val_macro_f1@0.3"])
    run_info = {
        "run_id": run_id, "smoke": args.smoke, "config": cfg,
        "finished_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "best_epoch": best_row["epoch"], "epochs_run": len(history), "train_seconds": round(train_sec, 1),
        "device": str(device), "gpu": gpu, "precision": precision,
        "peak_gpu_mem_longest_batch_gib": round(peak, 3), "n_params": n_params,
        "versions": {"python": platform.python_version(), "torch": torch.__version__,
                     "cuda": torch.version.cuda, "transformers": __import__("transformers").__version__},
        "data_meta": load_json(P.processed_kote / "meta.json")["source_sha256"],
        "rows": {s: len(data[s]["y"]) for s in SPLITS},
        "global_threshold_val_macro_f1": g_val,
        "metrics": results,
        "checkpoint_dir": ckpt_dir.relative_to(P.repo_root).as_posix(),
    }
    (out_dir / "metrics.json").write_text(json.dumps(run_info, ensure_ascii=False, indent=1, default=float),
                                          encoding="utf-8")
    for name in strategies:
        t = results[name]["test"]
        log(f"[test] {name:16s} macro-F1 {t['macro_f1']:.4f} micro-F1 {t['micro_f1']:.4f} "
            f"weighted-F1 {t['weighted_f1']:.4f} AUC {t['macro_roc_auc']:.4f} "
            f"예측 라벨 수 {t['mean_pred_labels']:.2f}/정답 {t['mean_true_labels']:.2f}", fh)
    log(f"완료: best epoch {best_row['epoch']}, 학습 {train_sec / 60:.1f}분, 결과 {out_dir.relative_to(P.repo_root).as_posix()}", fh)
    fh.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
