"""KOTE 원본 로딩.

TSV는 헤더가 없는 `ID<TAB>text<TAB>labels` 형식이며, 공식 로딩 스크립트(kote.py)와 같은
csv.DictReader(delimiter="\\t") 규칙으로 읽는다. labels는 "2,13,15"처럼 쉼표로 구분된 라벨 ID 문자열이다.
여기서는 문자열을 그대로 보존하고(labels_raw), 정수 변환 결과는 별도 컬럼으로 둔다.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import pandas as pd

SPLITS = ("train", "validation", "test")


def read_kote_tsv(path: Path, fieldnames: list[str]) -> pd.DataFrame:
    """공식 kote.py와 같은 방식으로 TSV를 읽고 원본 문자열을 보존한다."""
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t", fieldnames=fieldnames))
    df = pd.DataFrame(rows, columns=fieldnames).rename(columns={"labels": "labels_raw"})
    df["labels"] = df["labels_raw"].map(_parse_or_none)
    df["labels_parse_error"] = df["labels_raw"].notna() & df["labels"].isna()
    # 필드가 남거나(restkey=None) 모자란(None 값) 행 수. 파싱 이상 탐지용.
    df.attrs["rows_with_extra_fields"] = sum(1 for r in rows if None in r)
    df.attrs["rows_with_missing_fields"] = sum(1 for r in rows if any(r.get(k) is None for k in fieldnames))
    return df


def parse_label_string(s: str | None) -> list[int] | None:
    """'2,13,15' → [2, 13, 15]. 값이 없으면 None, 빈 문자열이면 []. 숫자가 아닌 토큰은 ValueError."""
    if s is None:
        return None
    s = s.strip()
    if s == "":
        return []
    return [int(tok) for tok in s.split(",")]


def _parse_or_none(s: str | None) -> list[int] | None:
    try:
        return parse_label_string(s)
    except ValueError:
        return None


def count_physical_lines(path: Path) -> int:
    with open(path, encoding="utf-8", newline="") as f:
        return sum(1 for _ in f)


def load_kote_splits(raw_dir: Path, source_cfg: dict) -> dict[str, pd.DataFrame]:
    gh = source_cfg["github"]
    return {
        split: read_kote_tsv(Path(raw_dir) / "github" / fname, gh["tsv_fieldnames"])
        for split, fname in gh["splits"].items()
    }


def load_parquet_splits(raw_dir: Path) -> dict[str, pd.DataFrame]:
    """Hugging Face Parquet 변환본(교차검증용)."""
    out = {}
    for split in SPLITS:
        df = pd.read_parquet(Path(raw_dir) / "hf_parquet" / f"{split}.parquet")
        df["labels"] = df["labels"].map(lambda a: [int(x) for x in a])
        out[split] = df
    return out


def load_raw_annotations(raw_dir: Path) -> dict:
    """raw.json: {ID: {"text": str, "labels": {"rater1": [라벨명, ...], ..., "rater5": [...]}}}"""
    with open(Path(raw_dir) / "hf" / "raw.json", encoding="utf-8") as f:
        return json.load(f)
