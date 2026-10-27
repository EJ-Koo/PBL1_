"""노트북 실행 환경 점검.

VS Code에서 저장소 .venv가 아닌 다른 커널(conda 환경 등)을 고르면 중간에 ModuleNotFoundError가 난다.
노트북 첫 셀에서 이 함수를 호출해, 필요한 패키지가 현재 커널에 있는지 먼저 확인한다.
표준 라이브러리만 사용한다(필요 패키지가 없어도 이 모듈은 import 가능해야 하므로).
"""
from __future__ import annotations

import re
import sys
from importlib import metadata
from pathlib import Path

_REQ_LINE = re.compile(r"^\s*([A-Za-z0-9_.\-]+)\s*(?:==\s*([^\s;#]+))?")


def read_requirements(path: Path) -> dict[str, str | None]:
    """requirements 파일을 {패키지: 고정 버전}으로 읽는다. `-r 다른파일`은 재귀로 포함한다."""
    path = Path(path)
    out: dict[str, str | None] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("-r "):
            out.update(read_requirements(path.parent / line[3:].strip()))
            continue
        if line.startswith("-"):
            continue
        m = _REQ_LINE.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _base_version(v: str) -> str:
    return v.split("+")[0]  # 2.14.1+cu130 → 2.14.1


# 노트북 커널 안에서는 쓰지 않는 패키지(ai/scripts/run_notebook.py 전용)
SCRIPT_ONLY = ("nbclient", "nbformat")


def check_environment(requirements_path: Path, repo_root: Path, skip=SCRIPT_ONLY) -> dict:
    reqs = {k: v for k, v in read_requirements(requirements_path).items() if k not in skip}
    rows = []
    for name, pinned in reqs.items():
        try:
            installed = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed = None
        rows.append({
            "package": name,
            "required": pinned or "-",
            "installed": installed or "없음",
            "status": "없음" if installed is None
            else ("OK" if pinned is None or _base_version(installed) == _base_version(pinned) else "버전 다름"),
        })
    venv = (Path(repo_root) / ".venv").resolve()
    return {
        "python": sys.version.split()[0],
        "is_repo_venv": Path(sys.prefix).resolve() == venv,
        "rows": rows,
        "missing": [r["package"] for r in rows if r["status"] == "없음"],
        "mismatch": [r["package"] for r in rows if r["status"] == "버전 다름"],
    }


def assert_environment(requirements_path: Path, repo_root: Path, skip=SCRIPT_ONLY) -> dict:
    """결과를 출력하고, 필요한 패키지가 없으면 커널 선택 안내와 함께 중단한다."""
    r = check_environment(requirements_path, repo_root, skip)
    print(f"Python {r['python']} | 저장소 .venv 커널 사용: {'예' if r['is_repo_venv'] else '아니오'}")
    width = max(len(x["package"]) for x in r["rows"])
    for x in r["rows"]:
        print(f"  {x['package']:<{width}}  필요 {x['required']:<10} 설치 {x['installed']:<16} {x['status']}")
    if r["mismatch"]:
        print("주의: 버전이 다른 패키지가 있습니다(결과 수치가 조금 달라질 수 있음):", ", ".join(r["mismatch"]))
    if r["missing"]:
        raise RuntimeError(
            "현재 커널에 필요한 패키지가 없습니다: " + ", ".join(r["missing"]) + "\n"
            "VS Code 오른쪽 위 커널 선택 → Python Environments → '.venv'(저장소 루트)를 고른 뒤 다시 실행하세요.\n"
            "아직 .venv가 없다면 ai/README.md의 '환경 설정'을 따라 만드세요."
        )
    return r
