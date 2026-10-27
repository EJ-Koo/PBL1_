"""분석 노트북을 새 커널로 처음부터 실행하고, 실행본/Git용 원본을 분리한다.

1) 노트북을 notebooks/ 폴더를 작업 디렉터리로 하여 위에서부터 전체 실행
2) 출력이 포함된 실행본을 ai/outputs/kote/ 에 저장 (Git 제외)
3) Git 관리용 원본 노트북의 outputs·execution_count·불필요한 metadata 정리

사용 예 (저장소 루트에서):
    .venv/Scripts/python ai/scripts/run_notebook.py            # 실행 + 정리
    .venv/Scripts/python ai/scripts/run_notebook.py --strip-only
"""
from __future__ import annotations

import argparse
import copy
import re
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient

AI_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NB = AI_ROOT / "notebooks" / "01_data_analysis.ipynb"
DEFAULT_OUT = AI_ROOT / "outputs" / "kote" / "01_data_analysis.executed.ipynb"

# 셀 소스에 남으면 안 되는 비밀값 형태(값 자체는 출력하지 않음)
SECRET_PATTERNS = {
    "huggingface_token": r"hf_[A-Za-z0-9]{20,}",
    "jwt_like": r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "openai_like_key": r"sk-[A-Za-z0-9]{20,}",
    "private_key_block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "windows_user_path": r"[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\\/\s\"']+",
}


def _display(path: Path) -> str:
    """저장소 기준 상대경로로 표시한다(저장소 밖이면 파일 이름만 표시해 개인 경로 노출을 피함)."""
    try:
        return path.resolve().relative_to(AI_ROOT.parent).as_posix()
    except ValueError:
        return f".../{path.name}"


def strip_notebook(nb: nbformat.NotebookNode) -> nbformat.NotebookNode:
    nb = copy.deepcopy(nb)
    for cell in nb.cells:
        cell.metadata = {}
        if cell.cell_type == "code":
            cell.outputs = []
            cell.execution_count = None
    nb.metadata = {
        "kernelspec": {"display_name": "Python 3 (ipykernel)", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
    }
    return nb


def scan_sources(nb: nbformat.NotebookNode) -> list[str]:
    hits = []
    for i, cell in enumerate(nb.cells):
        for name, pat in SECRET_PATTERNS.items():
            if re.search(pat, cell.source):
                hits.append(f"cell {i}: {name}")
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--notebook", type=Path, default=DEFAULT_NB)
    ap.add_argument("--executed-out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--strip-only", action="store_true")
    ap.add_argument("--timeout", type=int, default=3600)
    args = ap.parse_args()

    nb = nbformat.read(args.notebook, as_version=4)

    if not args.strip_only:
        client = NotebookClient(
            nb, timeout=args.timeout, kernel_name="python3",
            resources={"metadata": {"path": str(args.notebook.parent)}},
        )
        client.execute()  # 셀 오류 시 CellExecutionError로 중단
        args.executed_out.parent.mkdir(parents=True, exist_ok=True)
        nbformat.write(nb, args.executed_out)
        print(f"실행본 저장: {_display(args.executed_out)}")

    clean = strip_notebook(nb)
    nbformat.validate(clean)
    nbformat.write(clean, args.notebook)
    print(f"Git용 원본 정리: {_display(args.notebook)}")

    hits = scan_sources(clean)
    if hits:
        print("경고: 비밀값/개인 경로로 보이는 패턴이 셀 소스에 있습니다:", hits)
        return 1
    print("셀 소스 비밀값 패턴 점검: 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
