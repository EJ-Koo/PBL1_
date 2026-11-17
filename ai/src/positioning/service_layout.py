"""AI 서비스용 사용자별 우주 관리: 일기 → 임베딩 → 관련 기억 → 좌표.

- 사용자마다 LayoutStore 하나(ai/data/service/positioning/users/<user_id>/, Git 제외).
- 고정 PCA 투영기는 처음 한 번 참조 문장(가상 일기 dev)으로 fit해 저장하고, 이후에는 불러오기만 한다.
- 좌표는 저장소 단위로 보관하고, 응답할 때 고정 배율(scene_scale)을 곱해 프론트 장면 좌표로 준다.
- 기존 별 좌표는 절대 바꾸지 않는다. 일기 내용이 수정되면 검색용 임베딩만 바꾸고 위치는 그대로 둔다.
"""
from __future__ import annotations

import re
import threading
from pathlib import Path

import numpy as np

from src.data.paths import load_json
from src.embedding.encoders import TextEncoder, load_specs

from .projectors import FixedPCAProjector
from .store import LayoutStore, NeighborPlacer

_USER_ID = re.compile(r"^[0-9a-fA-F-]{8,64}$")


class UserLayoutService:
    def __init__(self, ai_root: Path, service_cfg: dict, device: str | None = None, data_dir: Path | None = None):
        self.ai_root = Path(ai_root)
        self.cfg = service_cfg["positioning"]
        cfg_dir = self.ai_root / "configs"
        specs = load_specs(load_json(cfg_dir / self.cfg["embedding_models_config"]))
        self.encoder = TextEncoder(specs[self.cfg["embedding_model"]], device=device or "cpu").load()
        self.data_dir = Path(data_dir) if data_dir else self.ai_root / self.cfg["data_dir"]
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.pca = self._load_or_fit_projector(cfg_dir)
        self.placer = NeighborPlacer(self.pca, tau=self.cfg["tau"], k=self.cfg["neighbor"]["k"], gap=self.cfg["neighbor"]["gap"])
        self.scale = float(self.cfg["scene_scale"])
        self._stores: dict[str, LayoutStore] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._global = threading.Lock()

    # ------------------------------------------------------------ 준비
    def _load_or_fit_projector(self, cfg_dir: Path) -> FixedPCAProjector:
        path = self.data_dir / "projector_pca.npz"
        ver_path = self.data_dir / "projector_embedding_version.txt"
        if path.exists():
            saved_ver = ver_path.read_text(encoding="utf-8").strip()
            if saved_ver != self.encoder.embedding_version:
                raise RuntimeError(f"저장된 투영기의 임베딩 버전({saved_ver})이 현재 모델과 다릅니다. "
                                   "모델을 바꿨다면 저장소를 새로 만들어야 합니다(기존 좌표와 섞이지 않도록).")
            return FixedPCAProjector.load(path)
        ref = self.cfg["reference"]
        texts = [d["text"] for d in load_json(cfg_dir / ref["dataset"])["diaries"] if d["split"] == ref["split"]]
        pca = FixedPCAProjector(self.cfg["target_radius"]).fit(self.encoder.encode(texts))
        pca.save(path)
        ver_path.write_text(self.encoder.embedding_version, encoding="utf-8")
        return pca

    @property
    def embedding_version(self) -> str:
        return self.encoder.embedding_version

    @property
    def layout_version(self) -> str:
        return self.placer.layout_version + f":scene_scale={self.scale}"

    def _user_dir(self, user_id: str) -> Path:
        if not _USER_ID.match(user_id):
            raise ValueError("user_id 형식이 올바르지 않습니다.")
        return self.data_dir / "users" / user_id.lower()

    def _lock(self, user_id: str) -> threading.Lock:
        with self._global:
            return self._locks.setdefault(user_id, threading.Lock())

    def _store(self, user_id: str) -> LayoutStore:
        if user_id not in self._stores:
            folder = self._user_dir(user_id)
            if (folder / "stars.json").exists():
                self._stores[user_id] = LayoutStore.load(folder, self.placer)
            else:
                self._stores[user_id] = LayoutStore(self.placer, self.embedding_version, self.cfg["min_dist"])
        return self._stores[user_id]

    # ------------------------------------------------------------ 기능
    def _related(self, store: LayoutStore, emb: np.ndarray, exclude: str | None) -> list[dict]:
        if not len(store):
            return []
        sims = store.embedding_matrix() @ np.asarray(emb, np.float64)
        out = []
        for j in np.argsort(-sims, kind="stable"):
            if store.ids[j] == exclude:
                continue
            if sims[j] < self.cfg["tau"] or len(out) == self.cfg["k_related"]:
                break
            out.append({"diary_id": store.ids[j], "similarity": round(float(sims[j]), 4)})
        return out

    def _star(self, rec) -> dict:
        return {"x": rec.x * self.scale, "y": rec.y * self.scale, "z": rec.z * self.scale}

    def add(self, user_id: str, diary_id: str, text: str) -> dict:
        """새 일기 → 좌표. 같은 diary_id가 이미 있으면 새로 만들지 않고 저장된 좌표를 돌려준다."""
        with self._lock(user_id):
            store = self._store(user_id)
            if diary_id in store:
                rec = store.get(diary_id)
                emb = store.embedding_matrix()[store.ids.index(diary_id)]
                return {"created": False, "star": self._star(rec), "related": self._related(store, emb, diary_id),
                        "rule": rec.rule, **self._versions()}
            emb = self.encoder.encode([text])[0]
            related = self._related(store, emb, None)
            rec, _ = store.add(diary_id, emb, self.embedding_version)
            store.save(self._user_dir(user_id))
            return {"created": True, "star": self._star(rec), "related": related, "rule": rec.rule,
                    "anchors": rec.anchor_ids, "collision_adjusted": rec.collision_adjusted, **self._versions()}

    def update(self, user_id: str, diary_id: str, text: str) -> dict | None:
        """수정된 일기: 검색용 임베딩만 바꾼다(좌표 유지). 저장소에 없는 일기면 None."""
        with self._lock(user_id):
            store = self._store(user_id)
            if diary_id not in store:
                return None
            rec = store.update_embedding(diary_id, self.encoder.encode([text])[0], self.embedding_version)
            store.save(self._user_dir(user_id))
            return {"updated": True, "star": self._star(rec), **self._versions()}

    def remove(self, user_id: str, diary_id: str) -> bool:
        with self._lock(user_id):
            store = self._store(user_id)
            removed = store.remove(diary_id)
            if removed:
                store.save(self._user_dir(user_id))
            return removed

    def related(self, user_id: str, diary_id: str) -> list[dict] | None:
        with self._lock(user_id):
            store = self._store(user_id)
            if diary_id not in store:
                return None
            emb = store.embedding_matrix()[store.ids.index(diary_id)]
            return self._related(store, emb, diary_id)

    def _versions(self) -> dict:
        return {"embedding_version": self.embedding_version, "layout_version": self.layout_version}
