"""일기 텍스트 → 임베딩 → 관련 기억 검색 → 좌표 생성을 한 번에 하는 로컬 흐름.

나중에 AI 서비스(/embed, /layout)로 옮길 때 그대로 쓸 수 있는 형태로 묶었다. 이번 단계에서는
운영 백엔드·DB와 연결하지 않고 로컬 파일 저장소(LayoutStore)만 쓴다.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .store import LayoutStore


@dataclass
class AddResult:
    diary_id: str
    created: bool                 # False = 이미 있던 일기(중복 요청) → 저장 좌표 그대로
    xyz: tuple[float, float, float]
    related: list[tuple[str, float]]   # (diary_id, 코사인 유사도) — 확률 아님
    rule: str
    collision_adjusted: bool


class MemoryUniverse:
    def __init__(self, encoder, store: LayoutStore, tau: float, k_related: int = 3):
        if encoder.embedding_version != store.embedding_version:
            raise ValueError("encoder와 store의 embedding_version이 다릅니다.")
        self.encoder, self.store, self.tau, self.k = encoder, store, tau, k_related

    def related(self, emb: np.ndarray, exclude: str | None = None) -> list[tuple[str, float]]:
        """저장된 일기 중 코사인 ≥ τ인 상위 k개. 없으면 빈 목록(억지로 연결하지 않음)."""
        if not len(self.store):
            return []
        sims = self.store.embedding_matrix() @ np.asarray(emb, np.float64)
        out = []
        for j in np.argsort(-sims, kind="stable"):
            if self.store.ids[j] == exclude:
                continue
            if sims[j] < self.tau or len(out) == self.k:
                break
            out.append((self.store.ids[j], float(sims[j])))
        return out

    def add_diary(self, diary_id: str, text: str) -> AddResult:
        if diary_id in self.store:   # 중복 요청: 다시 인코딩·배치하지 않는다
            rec = self.store.get(diary_id)
            emb = self.store.embedding_matrix()[self.store.ids.index(diary_id)]
            return AddResult(diary_id, False, (rec.x, rec.y, rec.z), self.related(emb, exclude=diary_id),
                             rec.rule, rec.collision_adjusted)
        emb = self.encoder.encode([text])[0]
        related = self.related(emb)
        rec, created = self.store.add(diary_id, emb, self.encoder.embedding_version)
        return AddResult(diary_id, created, (rec.x, rec.y, rec.z), related, rec.rule, rec.collision_adjusted)
