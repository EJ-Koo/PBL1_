"""기존 별 재배치 스크립트 (한 번만 실행).

별 생성 시 겹침 방지(최소 간격)를 넣기 전에 만들어진 별들 중, 서로 겹치는 별만
빈자리로 옮긴다. 겹치지 않는 별은 그대로 둔다. 사용자마다 따로 처리한다.

사용법 (backend/ 디렉토리에서, .env 필요):
    python scripts/respace_stars.py           # 미리보기: 몇 개를 옮길지만 출력 (DB 변경 없음)
    python scripts/respace_stars.py --apply   # 실제로 DB의 x, y, z를 수정

주의: 팀이 함께 쓰는 Supabase DB를 직접 수정한다. 먼저 미리보기로 확인하고 --apply를 쓴다.
"""

import argparse
import math
import sys
from collections import defaultdict
from pathlib import Path

# scripts/ 안에서 실행해도 app 패키지를 찾도록 backend/ 를 경로에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import supabase  # noqa: E402
from app.routers.diaries import STAR_MIN_GAP, STAR_SIZE_RANGE, _free_star_position  # noqa: E402


def _size(star: dict) -> float:
    return float(star.get("size") or STAR_SIZE_RANGE[0])


def _overlaps(star: dict, placed: list[dict]) -> bool:
    return any(
        math.dist((star["x"], star["y"], star["z"]), (o["x"], o["y"], o["z"]))
        - (_size(star) + _size(o))
        < STAR_MIN_GAP
        for o in placed
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="겹친 별 재배치")
    parser.add_argument("--apply", action="store_true", help="실제로 DB를 수정한다 (없으면 미리보기)")
    args = parser.parse_args()

    stars = (
        supabase.table("stars").select("id, x, y, z, size, diaries!inner(user_id)").execute().data
        or []
    )
    by_user: dict[str, list[dict]] = defaultdict(list)
    for s in stars:
        by_user[s["diaries"]["user_id"]].append(s)

    moves: list[tuple[str, tuple[float, float, float]]] = []
    for user_id, user_stars in by_user.items():
        placed: list[dict] = []
        moved = 0
        # 큰 별부터 자리를 확정하고, 그와 겹치는 작은 별을 옮긴다 (큰 별이 덜 움직이도록).
        for s in sorted(user_stars, key=_size, reverse=True):
            if _overlaps(s, placed):
                x, y, z = _free_star_position(_size(s), placed)
                s = {**s, "x": x, "y": y, "z": z}
                moves.append((s["id"], (x, y, z)))
                moved += 1
            placed.append(s)
        print(f"사용자 {user_id[:8]}…: 별 {len(user_stars)}개 중 {moved}개 이동 필요")

    print(f"\n전체: 별 {len(stars)}개 중 {len(moves)}개 이동 필요")
    if not args.apply:
        print("미리보기만 했습니다. 실제로 옮기려면 --apply 를 붙여 다시 실행하세요.")
        return

    for star_id, (x, y, z) in moves:
        supabase.table("stars").update({"x": x, "y": y, "z": z}).eq("id", star_id).execute()
    print(f"{len(moves)}개 별 위치를 수정했습니다.")


if __name__ == "__main__":
    main()
