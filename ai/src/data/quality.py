"""텍스트·라벨 품질 점검과 전처리 판단용 패턴.

모든 함수는 원본을 수정하지 않고 플래그·집계만 반환한다.
"""
from __future__ import annotations

import re

import pandas as pd

_WS = re.compile(r"\s+")


def normalize_minimal(text: str) -> str:
    """최소 정규화: 앞뒤 공백 제거 + 연속 공백(탭·줄바꿈 포함)을 공백 하나로."""
    return _WS.sub(" ", text).strip()


def label_flags(labels: pd.Series, num_labels: int) -> pd.DataFrame:
    """샘플별 라벨 이상 여부 플래그."""
    return pd.DataFrame({
        "label_missing": labels.isna(),
        "label_empty": labels.map(lambda x: x is not None and len(x) == 0),
        "label_invalid_id": labels.map(lambda x: x is not None and any(not 0 <= v < num_labels for v in x)),
        "label_duplicate_in_sample": labels.map(lambda x: x is not None and len(x) != len(set(x))),
    })


def text_flags(text: pd.Series) -> pd.DataFrame:
    return pd.DataFrame({
        "text_missing": text.isna(),
        "text_empty": text.fillna("").eq(""),
        "text_whitespace_only": text.fillna("").map(lambda s: s != "" and s.strip() == ""),
        "text_has_edge_whitespace": text.fillna("").map(lambda s: s != s.strip()),
        "text_has_newline_or_tab": text.fillna("").str.contains(r"[\r\n\t]", regex=True),
    })


def duplicate_groups(df: pd.DataFrame, key: str) -> pd.DataFrame:
    """key 값이 2회 이상 등장하는 행만 반환한다(split·ID 포함)."""
    return df[df.duplicated(key, keep=False)].sort_values(key)


# 전처리 판단용 패턴: 삭제 대상이 아니라 '얼마나 있는지' 세기 위한 것.
TEXT_PATTERNS: dict[str, str] = {
    "laugh_ㅋㅎ": r"[ㅋㅎ]{2,}",
    "cry_ㅠㅜ": r"[ㅠㅜ]{2,}",
    "jamo_any": r"[ㄱ-ㅎㅏ-ㅣ]",
    "emoji_pictograph": r"[\U0001F300-\U0001FAFF\U0001F1E6-\U0001F1FF]",
    "symbol_heart_star": r"[☀-➿]",  # ♥ ♡ ☆ ★ 등 기호(그림 이모지와 구분)
    "emoticon_ascii": r"(?:\^\^|\^_\^|:\)|:\(|;\)|T_T|ㅡㅡ|-_-)",
    "repeated_punct": r"([!?.~])\1{2,}",
    "ellipsis_char": r"…",
    "url": r"(?:https?://|www\.)\S+",
    "angle_bracket_tag_like": r"</?[A-Za-z][^>]{0,50}>",  # HTML 태그 형태. 제목 표기 <...>도 걸리므로 사례 확인 필요
    "html_entity": r"&(?:[a-zA-Z]+|#\d+);",
    "mention_or_hashtag": r"(?:^|\s)[@#][^\s]+",
    "asterisk_or_circle_run": r"[*＊]{2,}|[Xx○●]{2,}",  # 마스킹 또는 강조 표기

    "latin_letters": r"[A-Za-z]",
    "digits": r"\d",
    "hanja": r"[一-鿿]",
    "control_or_zero_width": r"[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‏﻿]",
}


def pattern_flags(text: pd.Series, patterns: dict[str, str] = TEXT_PATTERNS) -> pd.DataFrame:
    # pandas 문자열 백엔드(Arrow/RE2)와 무관하게 같은 결과가 나오도록 Python re를 사용한다.
    compiled = {name: re.compile(p) for name, p in patterns.items()}
    values = text.fillna("").tolist()
    return pd.DataFrame(
        {name: [rx.search(s) is not None for s in values] for name, rx in compiled.items()},
        index=text.index,
    )
