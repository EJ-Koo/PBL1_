"""KOTE 공식 출처(GitHub TSV, Hugging Face raw.json·Parquet 변환본) 다운로드.

- 출처 revision은 ai/configs/kote_source.json에 고정한다.
- 이미 받은 파일은 manifest의 SHA-256과 일치하면 다시 받지 않는다.
- 원본 파일은 받은 그대로 저장하며 수정하지 않는다.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_NAME = "manifest.json"
USER_AGENT = "PBL1-ai-kote-analysis/0.1"


def sha256_file(path: Path, chunk_size: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path, timeout: int = 120) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(tmp, "wb") as out:
        shutil.copyfileobj(resp, out)
    tmp.replace(dest)


def planned_files(source_cfg: dict) -> list[dict]:
    """다운로드할 파일 목록(로컬 상대경로, URL, revision, 기대 SHA-256)을 만든다."""
    gh, hf = source_cfg["github"], source_cfg["huggingface"]
    files = []
    for split, fname in gh["splits"].items():
        files.append({
            "key": f"github_tsv/{split}",
            "local": f"github/{fname}",
            "url": gh["url_template"].format(revision=gh["revision"], filename=fname),
            "source": gh["homepage"],
            "revision": gh["revision"],
        })
    raw = hf["raw_annotations"]
    files.append({
        "key": "hf/raw_annotations",
        "local": f"hf/{raw['filename']}",
        "url": hf["url_template"].format(revision=hf["revision"], filename=raw["filename"]),
        "source": hf["homepage"],
        "revision": hf["revision"],
        "expected_sha256": raw["expected_sha256"],
    })
    # 로딩 스크립트는 라벨 목록 확인용 텍스트로만 저장한다(.txt 확장자로 import/실행 방지).
    files.append({
        "key": "hf/loader_script",
        "local": "hf/kote_loader_script.py.txt",
        "url": hf["url_template"].format(revision=hf["revision"], filename=hf["loader_script"]),
        "source": hf["homepage"],
        "revision": hf["revision"],
    })
    pq = hf["parquet_convert"]
    for split, fname in pq["splits"].items():
        files.append({
            "key": f"hf_parquet/{split}",
            "local": f"hf_parquet/{split}.parquet",
            "url": hf["url_template"].format(revision=pq["revision"], filename=fname),
            "source": hf["homepage"] + " (refs/convert/parquet)",
            "revision": pq["revision"],
        })
    return files


def load_manifest(raw_dir: Path) -> dict:
    p = raw_dir / MANIFEST_NAME
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"files": {}}


def ensure_kote_raw(raw_dir: Path, source_cfg: dict, force: bool = False) -> dict:
    """KOTE 원본을 raw_dir에 준비하고 manifest를 반환한다.

    파일이 존재하고 manifest의 SHA-256과 같으면 재사용(status='reused'),
    아니면 다운로드(status='downloaded')한다. 기대 SHA-256이 있으면 반드시 검증한다.
    """
    raw_dir = Path(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(raw_dir)
    entries = manifest.setdefault("files", {})
    status = {}

    for spec in planned_files(source_cfg):
        dest = raw_dir / spec["local"]
        prev = entries.get(spec["key"])
        reusable = (
            not force
            and dest.exists()
            and prev is not None
            and prev.get("url") == spec["url"]
            and sha256_file(dest) == prev.get("sha256")
        )
        if reusable:
            status[spec["key"]] = "reused"
            continue

        _download(spec["url"], dest)
        digest = sha256_file(dest)
        expected = spec.get("expected_sha256")
        if expected and digest != expected:
            raise ValueError(f"SHA-256 불일치: {spec['key']} (expected {expected}, got {digest})")
        entries[spec["key"]] = {
            "local_path": spec["local"],
            "url": spec["url"],
            "source": spec["source"],
            "revision": spec["revision"],
            "sha256": digest,
            "size_bytes": dest.stat().st_size,
            "downloaded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        status[spec["key"]] = "downloaded"

    manifest["dataset"] = source_cfg["dataset"]
    manifest["license"] = source_cfg["license"]
    (raw_dir / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest["_status"] = status  # 이번 실행의 재사용/다운로드 여부(파일에는 저장하지 않음)
    return manifest
