"""고정 투영기: 참조 임베딩(dev)에만 한 번 fit하고, 새 일기는 transform만 한다.

- 신규·테스트 일기는 fit에 쓰지 않는다(사전 학습 금지 규칙).
- 좌표 크기(scale)도 fit 때 한 번 정해 고정한다. 일기가 추가될 때마다 다시 정규화하지 않는다.
- fingerprint는 투영 파라미터의 해시다. 저장된 좌표의 layout_version에 들어가므로,
  투영기가 바뀌면 저장소가 다른 버전으로 인식한다.
"""
from __future__ import annotations

import hashlib
import pickle
from pathlib import Path

import numpy as np


def _radius_scale(coords: np.ndarray, target_radius: float, q: float = 95.0) -> float:
    r = np.percentile(np.linalg.norm(coords, axis=1), q)
    return float(target_radius / max(r, 1e-9))


class FixedPCAProjector:
    """방식 A: 임베딩 → (참조 평균 빼기) → 상위 3개 주성분 → 고정 배율."""

    name = "pca3"

    def __init__(self, target_radius: float = 10.0):
        self.target_radius = target_radius
        self.mean_: np.ndarray | None = None
        self.components_: np.ndarray | None = None
        self.scale_: float | None = None
        self.explained_variance_ratio_: np.ndarray | None = None
        self.n_ref_: int = 0

    def fit(self, E_ref: np.ndarray) -> "FixedPCAProjector":
        E = np.asarray(E_ref, dtype=np.float64)
        self.mean_ = E.mean(0)
        _, s, vt = np.linalg.svd(E - self.mean_, full_matrices=False)
        comps = vt[:3]
        # 부호 고정(SVD 부호는 임의): 각 성분에서 절댓값이 가장 큰 원소가 양수가 되도록
        signs = np.sign(comps[np.arange(3), np.abs(comps).argmax(1)])
        self.components_ = comps * signs[:, None]
        var = s ** 2
        self.explained_variance_ratio_ = var[:3] / var.sum()
        self.n_ref_ = len(E)
        self.scale_ = 1.0
        self.scale_ = _radius_scale(self.transform(E), self.target_radius)
        return self

    def transform(self, E: np.ndarray) -> np.ndarray:
        if self.components_ is None:
            raise RuntimeError("fit()을 먼저 호출하세요.")
        return ((np.asarray(E, np.float64) - self.mean_) @ self.components_.T) * self.scale_

    @property
    def fingerprint(self) -> str:
        h = hashlib.sha1()
        for a in (self.mean_, self.components_, np.array([self.scale_])):
            h.update(np.ascontiguousarray(a, dtype=np.float64).tobytes())
        return h.hexdigest()[:10]

    def save(self, path: Path) -> None:
        np.savez(path, mean=self.mean_, components=self.components_, scale=self.scale_,
                 evr=self.explained_variance_ratio_, n_ref=self.n_ref_, target_radius=self.target_radius)

    @classmethod
    def load(cls, path: Path) -> "FixedPCAProjector":
        z = np.load(path)
        p = cls(float(z["target_radius"]))
        p.mean_, p.components_, p.scale_ = z["mean"], z["components"], float(z["scale"])
        p.explained_variance_ratio_, p.n_ref_ = z["evr"], int(z["n_ref"])
        return p


class FixedPCAUMAPProjector:
    """방식 B: 임베딩 → 고정 PCA(n_pca차원) → 참조에 fit한 UMAP(3D)의 transform → 고정 중심·배율.

    UMAP transform은 새 점을 기존 참조 임베딩 근처에 놓는 근사다. 참조 집합이 작으면(여기서는 38개)
    참조 밖 주제는 아무 참조점 근처로 끌려갈 수 있다.
    """

    name = "pca_umap3"

    def __init__(self, n_pca: int = 16, n_neighbors: int = 8, min_dist: float = 0.5,
                 metric: str = "cosine", random_state: int = 42, target_radius: float = 10.0):
        self.n_pca, self.n_neighbors, self.min_dist = n_pca, n_neighbors, min_dist
        self.metric, self.random_state, self.target_radius = metric, random_state, target_radius
        self.mean_ = self.components_ = self.center_ = None
        self.scale_: float | None = None
        self.umap_ = None
        self.n_ref_ = 0

    def _pca(self, E: np.ndarray) -> np.ndarray:
        return (np.asarray(E, np.float64) - self.mean_) @ self.components_.T

    def fit(self, E_ref: np.ndarray) -> "FixedPCAUMAPProjector":
        import umap

        E = np.asarray(E_ref, dtype=np.float64)
        self.n_ref_ = len(E)
        k = min(self.n_pca, len(E) - 1)
        self.mean_ = E.mean(0)
        _, _, vt = np.linalg.svd(E - self.mean_, full_matrices=False)
        comps = vt[:k]
        signs = np.sign(comps[np.arange(k), np.abs(comps).argmax(1)])
        self.components_ = comps * signs[:, None]
        self.umap_ = umap.UMAP(n_components=3, n_neighbors=min(self.n_neighbors, len(E) - 1),
                               min_dist=self.min_dist, metric=self.metric, random_state=self.random_state,
                               transform_seed=self.random_state, n_jobs=1)
        Y = self.umap_.fit_transform(self._pca(E))
        self.center_ = Y.mean(0)
        self.scale_ = _radius_scale(Y - self.center_, self.target_radius)
        return self

    def transform(self, E: np.ndarray) -> np.ndarray:
        if self.umap_ is None:
            raise RuntimeError("fit()을 먼저 호출하세요.")
        Y = self.umap_.transform(self._pca(np.atleast_2d(E)))
        return (np.asarray(Y, np.float64) - self.center_) * self.scale_

    @property
    def fingerprint(self) -> str:
        h = hashlib.sha1()
        for a in (self.mean_, self.components_, self.center_, np.array([self.scale_]),
                  np.asarray(self.umap_.embedding_, np.float64)):
            h.update(np.ascontiguousarray(a, dtype=np.float64).tobytes())
        h.update(repr((self.n_pca, self.n_neighbors, self.min_dist, self.metric, self.random_state)).encode())
        return h.hexdigest()[:10]

    def save(self, path: Path) -> None:
        # 로컬 실험 결과 재현용(ai/outputs, Git 제외). 신뢰할 수 없는 pickle은 불러오지 않는다.
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: Path) -> "FixedPCAUMAPProjector":
        with open(path, "rb") as f:
            return pickle.load(f)
