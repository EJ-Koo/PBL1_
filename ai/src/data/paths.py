"""프로젝트 경로와 Hugging Face 캐시 위치 설정.

저장소 루트·ai/·notebooks/ 어디에서 실행해도 같은 경로를 쓰도록 이 파일 위치를 기준으로 계산한다.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ProjectPaths:
    repo_root: Path
    ai_root: Path
    configs: Path
    notebooks: Path
    reports: Path
    raw_kote: Path
    processed_kote: Path
    outputs_kote: Path
    checkpoints: Path
    cache: Path

    def make_local_dirs(self) -> None:
        """Git에서 제외되는 로컬 폴더를 실행 시 생성한다."""
        for p in (self.raw_kote, self.processed_kote, self.outputs_kote, self.checkpoints, self.cache):
            p.mkdir(parents=True, exist_ok=True)


def get_paths(ai_root: Path | None = None) -> ProjectPaths:
    ai = Path(ai_root or AI_ROOT).resolve()
    return ProjectPaths(
        repo_root=ai.parent,
        ai_root=ai,
        configs=ai / "configs",
        notebooks=ai / "notebooks",
        reports=ai / "reports",
        raw_kote=ai / "data" / "raw" / "kote",
        processed_kote=ai / "data" / "processed" / "kote",
        outputs_kote=ai / "outputs" / "kote",
        checkpoints=ai / "checkpoints",
        cache=ai / ".cache",
    )


def configure_hf_cache(paths: ProjectPaths) -> dict[str, str]:
    """Hugging Face 모델·데이터·토크나이저 캐시를 Git 제외 경로(ai/.cache/) 아래로 지정한다.

    huggingface_hub / transformers를 import하기 전에 호출해야 적용된다.
    """
    hf_home = paths.cache / "huggingface"
    env = {
        "HF_HOME": str(hf_home),
        "HF_HUB_CACHE": str(hf_home / "hub"),
        "HF_DATASETS_CACHE": str(hf_home / "datasets"),
        "HF_HUB_DISABLE_TELEMETRY": "1",
    }
    os.environ.update(env)
    return env


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)
