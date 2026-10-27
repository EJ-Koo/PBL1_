"""KOTE 감정 분류 학습 (확장판): 그룹 동시 학습(다중 과제), soft label, seed 반복.

train_emotion_baseline.py(초기 3개 실행에 사용)를 일반화한 스크립트다. 설정의 `objective`로 학습 목표를 정한다.
    "objective": {
        "label_target": "binary" | "soft_votes",   # 공식 이진 라벨 / 평가자 투표 비율(0~5명 / 5)
        "group_head": true | false,                 # 행성 감정 그룹(10개 + 없음)을 함께 맞히는 출력 추가
        "group_loss_weight": 1.0
    }
평가는 항상 공식 이진 라벨(그룹은 그 OR)로 한다. epoch 선택은 validation macro-F1(라벨별 threshold)로 한다.

저장 위치 (모두 Git 제외)
- 모델: ai/checkpoints/emotion/<run_id>/   (가중치·토크나이저·thresholds.json)
- 결과: ai/outputs/emotion/<run_id>/       (history.csv, metrics.json, {split}_probs.npy[44], {split}_group_probs.npy[11] 등)

사용 예 (저장소 루트):
    .venv/Scripts/python ai/scripts/train_emotion.py --config ai/configs/exp_kc_mtsoft.json --run-id kc_mtsoft_s42
    .venv/Scripts/python ai/scripts/train_emotion.py --config ... --seed 43 --run-id kc_mtsoft_s43
"""
from __future__ import annotations

import argparse
import json
import math
import os
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths, load_json  # noqa: E402

P = get_paths(AI_ROOT)
configure_hf_cache(P)
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "garbage_collection_threshold:0.8,max_split_size_mb:256")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
from torch.utils.data import DataLoader  # noqa: E402
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup  # noqa: E402

from src.data.kote_load import load_raw_annotations  # noqa: E402
from src.data.labels import load_label_names  # noqa: E402
from src.emotion import metrics as M  # noqa: E402
from src.emotion.data import MultiLabelDataset, encode_texts, load_processed_split, make_collate  # noqa: E402
from src.emotion.planet_mapping import load_mapping  # noqa: E402
from src.emotion.targets import group_membership, group_scores, group_targets, vote_fractions  # noqa: E402
from src.emotion.train import (amp_context, build_model, build_optimizer, make_multitask_loss,  # noqa: E402
                               predict_probs, set_seed, train_one_epoch)

SPLITS = ("train", "validation", "test")


def log(msg: str, fh=None):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if fh:
        fh.write(line + "\n")
        fh.flush()


def save_with_retry(save_fn, desc: str, fh=None, tries: int = 5, wait: float = 10.0):
    """OneDrive 등이 파일을 잠깐 잠그면 PermissionError가 날 수 있어 다시 시도한다."""
    for k in range(1, tries + 1):
        try:
            return save_fn()
        except PermissionError as e:
            if k == tries:
                raise
            log(f"{desc} 저장 실패({e.__class__.__name__}), {wait:.0f}초 후 재시도 {k}/{tries - 1}", fh)
            time.sleep(wait)


def evaluate(probs_all, y_lab, y_grp, n_labels, members, thresholds=None, grid=None):
    """라벨·그룹(라벨에서 유도 / 그룹 출력) 지표. thresholds가 없으면 이 데이터에서 정한다(validation 전용)."""
    lab = probs_all[:, :n_labels]
    out, th = {}, dict(thresholds or {})
    if "label" not in th:
        th["label"] = M.tune_per_label_thresholds(y_lab, lab, grid)
    out["label"] = M.multilabel_metrics(y_lab, lab, th["label"])
    out["label@0.3"] = M.multilabel_metrics(y_lab, lab, 0.3)
    gd = group_scores(lab, members)
    if "group_derived" not in th:
        th["group_derived"] = M.tune_per_label_thresholds(y_grp, gd, grid)
    out["group_derived"] = M.multilabel_metrics(y_grp, gd, th["group_derived"])
    if probs_all.shape[1] > n_labels:
        gh = probs_all[:, n_labels:]
        if "group_head" not in th:
            th["group_head"] = M.tune_per_label_thresholds(y_grp, gh, grid)
        out["group_head"] = M.multilabel_metrics(y_grp, gh, th["group_head"])
    return out, th


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--seed", type=int, default=None, help="설정의 seed 대신 사용")
    ap.add_argument("--smoke", action="store_true", help="짧은 동작 확인: 학습 60 step, 평가 일부")
    args = ap.parse_args()

    cfg = load_json(args.config)
    tcfg, mcfg, dcfg, ecfg = cfg["train"], cfg["model"], cfg["data"], cfg["eval"]
    obj = cfg.get("objective", {"label_target": "binary", "group_head": False, "group_loss_weight": 1.0})
    if args.seed is not None:
        tcfg["seed"] = args.seed
    out_dir = P.ai_root / "outputs" / "emotion" / args.run_id
    ckpt_dir = P.checkpoints / "emotion" / args.run_id
    if ckpt_dir.exists() and any(ckpt_dir.iterdir()):
        raise FileExistsError(f"{ckpt_dir}에 이미 파일이 있습니다. 다른 --run-id를 쓰세요.")
    out_dir.mkdir(parents=True, exist_ok=True)
    fh = open(out_dir / "train.log", "a", encoding="utf-8")

    set_seed(tcfg["seed"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    precision = tcfg["precision"] if device.type == "cuda" else "fp32"
    gpu = torch.cuda.get_device_name(0) if device.type == "cuda" else "-"
    log(f"run_id={args.run_id} config={args.config.name} seed={tcfg['seed']} device={device} ({gpu}) objective={obj}", fh)

    # ---------------- 데이터와 학습 목표
    labels = load_label_names(P.configs / "kote_labels.json")
    n_lab = len(labels)
    group_ids, members = group_membership(load_mapping(P.configs / "planet_mapping.json"), labels)
    raw = load_raw_annotations(P.raw_kote) if obj["label_target"] == "soft_votes" else None
    tok = AutoTokenizer.from_pretrained(mcfg["repo_id"], revision=mcfg["revision"])
    data = {}
    for s in SPLITS:
        df, y = load_processed_split(P.processed_kote, s)
        if args.smoke and s != "train":
            df, y = df.iloc[:512], y[:512]
        ids = df["ID"].tolist()
        t_lab = vote_fractions(raw, ids, labels) if raw is not None else y.astype(np.float32)
        target = np.concatenate([t_lab, group_targets(t_lab, members)], 1) if obj["group_head"] else t_lab
        tok_ids, n_trunc = encode_texts(tok, df["text"].tolist(), dcfg["max_length"])
        data[s] = {"ids": ids, "ds": MultiLabelDataset(tok_ids, target), "y": y.astype(np.int8),
                   "y_grp": group_targets(y, members).astype(np.int8)}
        log(f"{s}: {len(df)}개, 잘린 샘플 {n_trunc}개, 학습 목표 {target.shape[1]}차원 "
            f"(평균 목표값 {target[:, :n_lab].mean():.4f})", fh)

    collate = make_collate(tok.pad_token_id)
    g = torch.Generator().manual_seed(tcfg["seed"])
    micro = tcfg.get("micro_batch_size") or tcfg["batch_size"]
    accum = tcfg["batch_size"] // micro
    train_loader = DataLoader(data["train"]["ds"], batch_size=micro, shuffle=True, collate_fn=collate,
                              generator=g, num_workers=tcfg["num_workers"])
    eval_loaders = {s: DataLoader(data[s]["ds"], batch_size=tcfg["eval_batch_size"], shuffle=False,
                                  collate_fn=collate) for s in ("validation", "test")}

    # ---------------- 모델
    out_names = labels + ([f"group:{gid}" for gid in group_ids] if obj["group_head"] else [])
    model = build_model(mcfg, out_names).to(device)
    if tcfg.get("gradient_checkpointing"):
        model.gradient_checkpointing_enable()
    loss_fn = make_multitask_loss(n_lab, obj.get("group_loss_weight", 1.0))
    n_params = sum(p.numel() for p in model.parameters())
    log(f"모델 {mcfg['repo_id']}@{mcfg['revision_name']} 파라미터 {n_params / 1e6:.1f}M, 출력 {len(out_names)}개", fh)

    epochs = 1 if args.smoke else tcfg["epochs"]
    max_steps = 60 if args.smoke else None
    updates = min(math.ceil(len(train_loader) / accum), max_steps or 10**9)
    total_steps = updates * epochs
    optimizer = build_optimizer(model, tcfg["learning_rate"], tcfg["weight_decay"])
    scheduler = get_linear_schedule_with_warmup(optimizer, int(total_steps * tcfg["warmup_ratio"]), total_steps)
    grid = M.threshold_grid(**ecfg["threshold_grid"])
    log(f"실효 batch {tcfg['batch_size']} = {micro}×{accum}, epochs {epochs}, total {total_steps} step, "
        f"epoch 선택 기준 {tcfg['selection_metric']}", fh)

    # ---------------- 학습
    yv, yv_g = data["validation"]["y"], data["validation"]["y_grp"]
    history, best, bad, best_state, t_start = [], -1.0, 0, None, time.time()
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        tr_loss = train_one_epoch(model, train_loader, optimizer, scheduler, device, precision, tcfg["max_grad_norm"],
                                  accum_steps=accum, log_every=50 if args.smoke else 250, max_steps=max_steps,
                                  log=lambda m: log(m, fh), loss_fn=loss_fn)
        if device.type == "cuda":
            torch.cuda.empty_cache()
        vp, v_loss = predict_probs(model, eval_loaders["validation"], device, precision, loss_fn=loss_fn)
        vm, _ = evaluate(vp, yv, yv_g, n_lab, members, grid=grid)
        row = {"epoch": epoch, "train_loss": tr_loss, "val_loss": v_loss,
               "val_macro_f1_tuned": vm["label"]["macro_f1"], "val_macro_f1@0.3": vm["label@0.3"]["macro_f1"],
               "val_micro_f1_tuned": vm["label"]["micro_f1"], "val_macro_auc": vm["label"]["macro_roc_auc"],
               "val_group_derived_macro_f1": vm["group_derived"]["macro_f1"],
               "val_group_head_macro_f1": vm["group_head"]["macro_f1"] if "group_head" in vm else np.nan,
               "epoch_sec": time.time() - t0}
        history.append(row)
        pd.DataFrame(history).to_csv(out_dir / "history.csv", index=False)
        score = row[{"val_macro_f1_tuned": "val_macro_f1_tuned", "val_macro_f1@0.3": "val_macro_f1@0.3"}[tcfg["selection_metric"]]]
        improved = score > best
        log(f"epoch {epoch}: train_loss {tr_loss:.4f} val_loss {v_loss:.4f} | val 라벨 macro-F1 {row['val_macro_f1_tuned']:.4f} "
            f"(@0.3 {row['val_macro_f1@0.3']:.4f}) AUC {row['val_macro_auc']:.4f} | val 그룹 macro-F1 "
            f"유도 {row['val_group_derived_macro_f1']:.4f} 출력 {row['val_group_head_macro_f1']:.4f} "
            f"({row['epoch_sec']:.0f}s){' *best' if improved else ''}", fh)
        if improved:
            best, bad = score, 0
            best_state = {k: v.detach().to("cpu", copy=True) for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= tcfg["early_stopping_patience"]:
                log(f"조기 종료: {bad} epoch 연속 개선 없음", fh)
                break
    train_sec = time.time() - t_start

    # ---------------- 저장 (최고 epoch, 한 번만)
    model.load_state_dict(best_state)
    save_with_retry(lambda: model.save_pretrained(ckpt_dir), "모델", fh)
    save_with_retry(lambda: tok.save_pretrained(ckpt_dir), "토크나이저", fh)
    model = AutoModelForSequenceClassification.from_pretrained(ckpt_dir).to(device)   # 저장본으로 평가
    if device.type == "cuda":
        torch.cuda.empty_cache()

    # ---------------- 최종 평가: threshold는 validation에서 정하고 test에 그대로 적용
    probs = {s: predict_probs(model, eval_loaders[s], device, precision, loss_fn=loss_fn)[0] for s in ("validation", "test")}
    mv, th = evaluate(probs["validation"], yv, yv_g, n_lab, members, grid=grid)
    mt, _ = evaluate(probs["test"], data["test"]["y"], data["test"]["y_grp"], n_lab, members, thresholds=th, grid=grid)
    for s in ("validation", "test"):
        np.save(out_dir / f"{s}_probs.npy", probs[s][:, :n_lab].astype(np.float32))
        if obj["group_head"]:
            np.save(out_dir / f"{s}_group_probs.npy", probs[s][:, n_lab:].astype(np.float32))
        np.save(out_dir / f"{s}_labels.npy", data[s]["y"].astype(np.float32))
        pd.Series(data[s]["ids"], name="ID").to_csv(out_dir / f"{s}_ids.csv", index=False)
    pc = M.per_label_counts(data["test"]["y"], M.binarize(probs["test"][:, :n_lab], th["label"]))
    pd.DataFrame({"label_id": range(n_lab), "label": labels, "support_test": pc["support"], "threshold": th["label"],
                  "precision": pc["precision"], "recall": pc["recall"], "f1": pc["f1"],
                  "roc_auc": M.roc_auc_per_label(data["test"]["y"], probs["test"][:, :n_lab])}
                 ).to_csv(out_dir / "per_label_test.csv", index=False, encoding="utf-8-sig")

    thresholds = {"max_length": dcfg["max_length"], "labels": labels, "groups": group_ids, "tuned_on": "validation",
                  "per_label": [float(x) for x in th["label"]], "group_derived": [float(x) for x in th["group_derived"]],
                  **({"group_head": [float(x) for x in th["group_head"]]} if "group_head" in th else {}),
                  "objective": obj}
    for d in (ckpt_dir, out_dir):
        save_with_retry(lambda d=d: (d / "thresholds.json").write_text(json.dumps(thresholds, ensure_ascii=False, indent=1),
                                                                       encoding="utf-8"), "thresholds", fh)
    best_row = max(history, key=lambda r: r[tcfg["selection_metric"]])
    info = {
        "run_id": args.run_id, "smoke": args.smoke, "config": cfg, "config_file": args.config.name, "seed": tcfg["seed"],
        "objective": obj, "finished_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "best_epoch": best_row["epoch"], "epochs_run": len(history), "train_seconds": round(train_sec, 1),
        "gpu": gpu, "n_params": n_params,
        "versions": {"python": platform.python_version(), "torch": torch.__version__,
                     "transformers": __import__("transformers").__version__},
        "metrics": {"validation": mv, "test": mt},
        "checkpoint_dir": ckpt_dir.relative_to(P.repo_root).as_posix(),
    }
    (out_dir / "metrics.json").write_text(json.dumps(info, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    t = mt
    log(f"[test] 라벨 macro-F1 {t['label']['macro_f1']:.4f} (@0.3 {t['label@0.3']['macro_f1']:.4f}) micro {t['label']['micro_f1']:.4f} "
        f"AUC {t['label']['macro_roc_auc']:.4f} | 그룹 macro-F1 유도 {t['group_derived']['macro_f1']:.4f}"
        + (f" 출력 {t['group_head']['macro_f1']:.4f}" if "group_head" in t else ""), fh)
    log(f"[val ] 라벨 macro-F1 {mv['label']['macro_f1']:.4f} | 그룹 macro-F1 유도 {mv['group_derived']['macro_f1']:.4f}"
        + (f" 출력 {mv['group_head']['macro_f1']:.4f}" if "group_head" in mv else ""), fh)
    log(f"완료: best epoch {best_row['epoch']}, 학습 {train_sec / 60:.1f}분, 결과 {out_dir.relative_to(P.repo_root).as_posix()}", fh)
    fh.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
