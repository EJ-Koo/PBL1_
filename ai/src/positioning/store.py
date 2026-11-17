"""행성 좌표 저장소와 배치 방식.

규칙(세 방식 공통):
- 이미 저장된 좌표는 다시 계산하지도, 옮기지도 않는다. 새 일기 하나만 좌표를 받는다.
- 다른 별과 너무 가까우면(min_dist 미만) 새 별만 비켜 놓는다(충돌 회피).
- 같은 diary_id를 다시 요청하면 새로 만들지 않고 저장된 좌표를 그대로 돌려준다.
- 관련 기록이 없어도(첫 일기 포함) 좌표를 만든다.
- 모든 좌표에 embedding_version·layout_version을 기록하고, 버전이 다른 임베딩은 받지 않는다.

배치 방식:
    ProjectionPlacer  (A·B) 고정 투영기 위치 = 그 일기 임베딩만으로 정해짐
    NeighborPlacer    (C)  관련 기억(코사인 ≥ τ, 상위 k)이 있으면 그 별들 근처,
                           없으면 고정 PCA 위치(A와 같은 식)
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


def fibonacci_directions(n: int = 32) -> np.ndarray:
    """구 위에 고르게 퍼진 n개 단위벡터(결정적)."""
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    theta = np.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(theta) * np.sin(phi), np.sin(theta) * np.sin(phi), np.cos(phi)], 1)


_DIRS = fibonacci_directions(32)


def stable_direction(key: str) -> np.ndarray:
    """diary_id에서 정해지는 고정 방향(파이썬 hash()는 실행마다 달라서 쓰지 않음)."""
    h = int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16)
    return _DIRS[h % len(_DIRS)]


def resolve_collision(p: np.ndarray, existing: np.ndarray, min_dist: float, max_rings: int = 40) -> tuple[np.ndarray, bool]:
    """p가 기존 별과 min_dist 미만으로 가까우면, p 주변 동심 껍질(반지름 0.5·min_dist 간격)의
    고정 방향 후보 중 모든 별과 min_dist 이상 떨어진 첫 껍질의 점을 고른다(같은 껍질에서는 가장 여유가 큰 점).
    기존 별(existing)은 절대 바꾸지 않는다."""
    if len(existing) == 0 or np.min(np.linalg.norm(existing - p, axis=1)) >= min_dist:
        return p, False
    for ring in range(1, max_rings + 1):
        cand = p + _DIRS * (0.5 * min_dist * ring)
        d = np.linalg.norm(cand[:, None, :] - existing[None, :, :], axis=2).min(1)
        ok = d >= min_dist
        if ok.any():
            j = np.flatnonzero(ok)[np.argmax(d[ok])]
            return cand[j], True
    raise RuntimeError("충돌 회피 위치를 찾지 못했습니다(max_rings를 늘리세요).")


@dataclass
class Proposal:
    xyz: np.ndarray
    anchor_ids: list[str] = field(default_factory=list)
    anchor_sims: list[float] = field(default_factory=list)
    rule: str = ""


class ProjectionPlacer:
    """방식 A(PCA)·B(PCA+UMAP): 고정 투영기의 transform 결과를 그대로 제안한다."""

    def __init__(self, projector, method: str):
        self.projector, self.method = projector, method

    @property
    def layout_version(self) -> str:
        return f"{self.method}:{self.projector.name}:{self.projector.fingerprint}"

    def propose(self, diary_id: str, emb: np.ndarray, store: "LayoutStore") -> Proposal:
        return Proposal(self.projector.transform(emb[None])[0], rule="projection")


class NeighborPlacer:
    """방식 C: 의미 이웃 순차 삽입.

    - 이웃 = 저장된 일기 중 코사인 ≥ tau인 상위 k개(원본 임베딩 기준; 3D 거리는 쓰지 않음)
    - 이웃 0개: 고정 PCA 위치(첫 일기·관련 없는 일기). 억지로 다른 별에 붙이지 않는다.
    - 이웃 1개 이상: 이웃 좌표의 가중 평균(가중치 = sim − tau + 0.05)에서,
      자기 PCA 위치 쪽으로 gap만큼 떨어진 점. 두 위치가 겹치면 diary_id로 정한 고정 방향.
    """

    def __init__(self, pca_projector, tau: float, k: int = 3, gap: float = 1.2, method: str = "C_neighbor"):
        self.pca, self.tau, self.k, self.gap, self.method = pca_projector, tau, k, gap, method

    @property
    def layout_version(self) -> str:
        return f"{self.method}:tau={self.tau:.4f}:k={self.k}:gap={self.gap}:{self.pca.name}:{self.pca.fingerprint}"

    def propose(self, diary_id: str, emb: np.ndarray, store: "LayoutStore") -> Proposal:
        own = self.pca.transform(emb[None])[0]
        if not store.ids:
            return Proposal(own, rule="first_star_pca")
        sims = store.embedding_matrix() @ emb
        order = np.argsort(-sims, kind="stable")[: self.k]
        nb = [j for j in order if sims[j] >= self.tau]
        if not nb:
            return Proposal(own, rule="no_neighbor_pca")
        X = store.coords()[nb]
        w = sims[nb] - self.tau + 0.05
        c = (w[:, None] * X).sum(0) / w.sum()
        d = own - c
        nrm = np.linalg.norm(d)
        d = d / nrm if nrm > 1e-6 else stable_direction(diary_id)
        return Proposal(c + d * self.gap, [store.ids[j] for j in nb], [float(sims[j]) for j in nb],
                        rule=f"neighbors_{len(nb)}")


class RandomShellPlacer:
    """비교 기준(현재 운영 방식과 같은 무작위 배치): 반지름 3~12 구 껍질 위 무작위.
    재현을 위해 diary_id로 난수 시드를 정한다. 의미를 쓰지 않는다."""

    method = "R_random"

    @property
    def layout_version(self) -> str:
        return "R_random:shell3-12"

    def propose(self, diary_id: str, emb: np.ndarray, store: "LayoutStore") -> Proposal:
        rng = np.random.default_rng(int(hashlib.md5(diary_id.encode("utf-8")).hexdigest()[:8], 16))
        r = 3 + rng.random() * 9
        theta, phi = rng.random() * 2 * np.pi, np.arccos(2 * rng.random() - 1)
        return Proposal(np.array([r * np.sin(phi) * np.cos(theta), r * np.sin(phi) * np.sin(theta), r * np.cos(phi)]),
                        rule="random")


@dataclass
class StarRecord:
    diary_id: str
    x: float
    y: float
    z: float
    method: str
    embedding_version: str
    layout_version: str
    rule: str
    anchor_ids: list[str]
    anchor_sims: list[float]
    collision_adjusted: bool
    proposed_xyz: list[float]
    seq: int
    elapsed_ms: float
    created_at: str

    @property
    def xyz(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z])


class LayoutStore:
    """한 사용자 우주의 좌표 저장소(실험용 로컬 구현; 운영 DB 연동 아님)."""

    def __init__(self, placer, embedding_version: str, min_dist: float = 0.8):
        self.placer = placer
        self.embedding_version = embedding_version
        self.layout_version = placer.layout_version
        self.min_dist = min_dist
        self.ids: list[str] = []
        self._records: dict[str, StarRecord] = {}
        self._emb: list[np.ndarray] = []

    def __len__(self) -> int:
        return len(self.ids)

    def __contains__(self, diary_id: str) -> bool:
        return diary_id in self._records

    def coords(self) -> np.ndarray:
        """저장된 좌표 복사본 (n, 3)."""
        return np.array([self._records[i].xyz for i in self.ids]).reshape(-1, 3)

    def embedding_matrix(self) -> np.ndarray:
        if not self._emb:
            return np.zeros((0, 0))
        return np.array(self._emb).reshape(len(self._emb), -1)

    def get(self, diary_id: str) -> StarRecord:
        return self._records[diary_id]

    def records(self) -> list[StarRecord]:
        return [self._records[i] for i in self.ids]

    def add(self, diary_id: str, emb: np.ndarray, embedding_version: str) -> tuple[StarRecord, bool]:
        """새 일기 좌표를 만든다. (기록, 새로 만들었는지). 이미 있으면 저장된 기록을 그대로 돌려준다."""
        if embedding_version != self.embedding_version:
            raise ValueError(f"embedding_version 불일치: {embedding_version} != {self.embedding_version}")
        if diary_id in self._records:
            return self._records[diary_id], False
        emb = np.asarray(emb, dtype=np.float64).ravel()
        t0 = time.perf_counter()
        prop = self.placer.propose(diary_id, emb, self)
        xyz, adjusted = resolve_collision(np.asarray(prop.xyz, float), self.coords(), self.min_dist)
        elapsed = (time.perf_counter() - t0) * 1000
        rec = StarRecord(
            diary_id=diary_id, x=float(xyz[0]), y=float(xyz[1]), z=float(xyz[2]),
            method=self.placer.method, embedding_version=self.embedding_version, layout_version=self.layout_version,
            rule=prop.rule, anchor_ids=prop.anchor_ids, anchor_sims=prop.anchor_sims, collision_adjusted=adjusted,
            proposed_xyz=[float(v) for v in prop.xyz], seq=len(self.ids), elapsed_ms=elapsed,
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        self._records[diary_id] = rec
        self.ids.append(diary_id)
        self._emb.append(emb)
        return rec, True

    def update_embedding(self, diary_id: str, emb: np.ndarray, embedding_version: str) -> StarRecord:
        """일기 내용이 수정됐을 때 관련 기억 검색용 임베딩만 바꾼다. 좌표는 그대로 둔다(기존 좌표 불변 규칙)."""
        if embedding_version != self.embedding_version:
            raise ValueError(f"embedding_version 불일치: {embedding_version} != {self.embedding_version}")
        i = self.ids.index(diary_id)
        self._emb[i] = np.asarray(emb, dtype=np.float64).ravel()
        return self._records[diary_id]

    def remove(self, diary_id: str) -> bool:
        """삭제된 일기를 저장소에서 뺀다. 다른 별의 좌표는 바꾸지 않는다."""
        if diary_id not in self._records:
            return False
        i = self.ids.index(diary_id)
        del self.ids[i], self._emb[i], self._records[diary_id]
        return True

    # ------------------------------------------------------------ 저장·재로딩
    def save(self, folder: Path) -> None:
        """임시 파일에 먼저 쓰고 바꿔 끼운다(쓰는 도중 멈춰도 이전 저장본이 깨지지 않도록)."""
        folder.mkdir(parents=True, exist_ok=True)
        meta = {"embedding_version": self.embedding_version, "layout_version": self.layout_version,
                "min_dist": self.min_dist, "n": len(self.ids), "ids": self.ids}
        tmp_npy, tmp_json = folder / "embeddings.npy.tmp", folder / "stars.json.tmp"
        with open(tmp_npy, "wb") as f:
            np.save(f, self.embedding_matrix().astype(np.float32))
        tmp_json.write_text(json.dumps(
            {"meta": meta, "stars": [asdict(r) for r in self.records()]}, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp_npy, folder / "embeddings.npy")
        os.replace(tmp_json, folder / "stars.json")

    @classmethod
    def load(cls, folder: Path, placer) -> "LayoutStore":
        data = json.loads((folder / "stars.json").read_text(encoding="utf-8"))
        meta = data["meta"]
        if meta["layout_version"] != placer.layout_version:
            raise ValueError(f"layout_version 불일치: 저장={meta['layout_version']} 현재={placer.layout_version}")
        store = cls(placer, meta["embedding_version"], meta["min_dist"])
        E = np.load(folder / "embeddings.npy").astype(np.float64)
        if len(E) != len(data["stars"]):
            raise ValueError(f"저장 파일이 맞지 않습니다: 좌표 {len(data['stars'])}개, 임베딩 {len(E)}개")
        for rec, e in zip(data["stars"], E):
            r = StarRecord(**rec)
            store._records[r.diary_id] = r
            store.ids.append(r.diary_id)
            store._emb.append(e)
        return store
