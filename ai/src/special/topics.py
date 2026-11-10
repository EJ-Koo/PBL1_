"""사용자가 일기에 고른 주제(선택 사항) 저장소.

DB 스키마를 바꾸지 않기 위해 AI 서비스 쪽에 사용자별 JSON 파일로 둔다
(ai/data/service/topics/users/<user_id>/topics.json, Git 제외). 주제를 고르지 않은 일기는 저장하지 않는다.
AI 서비스가 꺼져 있을 때 쓴 일기의 주제는 남지 않는다(한계: ai/reports/special_planet_v01_ko.md).
"""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path

_USER_ID = re.compile(r"^[0-9a-fA-F-]{8,64}$")


class TopicStore:
    def __init__(self, data_dir: Path, allowed: set[str]):
        self.data_dir = Path(data_dir)
        self.allowed = allowed
        self._lock = threading.Lock()

    def _path(self, user_id: str) -> Path:
        if not _USER_ID.match(user_id):
            raise ValueError("user_id 형식이 올바르지 않습니다.")
        return self.data_dir / "users" / user_id.lower() / "topics.json"

    def _read(self, user_id: str) -> dict[str, str]:
        path = self._path(user_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def _write(self, user_id: str, data: dict[str, str]) -> None:
        path = self._path(user_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)

    def set(self, user_id: str, diary_id: str, topic: str | None) -> None:
        if topic is not None and topic not in self.allowed:
            raise ValueError(f"알 수 없는 주제입니다: {topic}")
        with self._lock:
            data = self._read(user_id)
            if topic is None:
                if data.pop(diary_id, None) is None:
                    return
            else:
                data[diary_id] = topic
            self._write(user_id, data)

    def get_many(self, user_id: str, diary_ids: list[str]) -> list[str | None]:
        with self._lock:
            data = self._read(user_id)
        return [data.get(d) for d in diary_ids]

    def remove(self, user_id: str, diary_id: str) -> None:
        self.set(user_id, diary_id, None)
