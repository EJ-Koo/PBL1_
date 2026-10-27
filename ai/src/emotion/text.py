"""모델 입력용 최소 전처리 (01_data_analysis의 권고).

원문 데이터는 바꾸지 않고, 모델에 넣기 직전에만 적용한다.
ㅋㅋ·ㅠㅠ·이모티콘·이모지·반복 문장부호는 감정 단서이므로 그대로 둔다.
"""
from __future__ import annotations

import html
import re

_CONTROL = re.compile(r"[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‏﻿]")
_WS = re.compile(r"\s+")


def prepare_text(text: str) -> str:
    text = html.unescape(text)          # &quot; → "  (KOTE 4건)
    text = _CONTROL.sub(" ", text)      # 제어·폭 0 문자 → 공백 (KOTE 1건)
    return _WS.sub(" ", text).strip()   # 앞뒤 공백 제거, 연속 공백 축소
