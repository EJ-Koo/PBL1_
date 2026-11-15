"""[ADDED 2026-11-13] AI 서비스 주제 JSON → diaries.topic 옮기기(backfill) SQL 만들기.

AI 서비스는 사용자가 고른 주제를 ai/data/service/topics/users/<user_id>/topics.json ({diary_id: topic}) 에 저장해 왔다.
이 스크립트는 그 파일들을 읽어 UPDATE 문 SQL 파일을 만든다. **Supabase 에 직접 접속하거나 쓰지 않는다.**
만든 SQL 을 사람이 검토한 뒤 Supabase SQL Editor 에서 실행한다(migrations/2026-11-13_diary_topic.sql 실행 후).

안전장치(만든 SQL 안에 들어 있다)
  - where id = <일기> and user_id = <그 JSON 의 사용자> and topic is null
      → 다른 사람의 일기에는 쓰지 않고, 이미 주제가 있는 일기는 덮어쓰지 않는다. 여러 번 실행해도 결과가 같다.
  - 앱이 모르는 주제 값, 형식이 틀린 id 는 SQL 에 넣지 않고 건너뛴 목록으로 보고한다.
  - 전체를 한 트랜잭션(begin/commit)으로 감싼다.

사용법 (저장소 루트)
  backend/.venv/Scripts/python backend/scripts/backfill_diary_topics.py                 # 요약만(아무것도 쓰지 않음)
  backend/.venv/Scripts/python backend/scripts/backfill_diary_topics.py --out topics_backfill.sql
  # 로컬 검증용: 로컬 Postgres DSN 에 바로 적용(운영 DB 주소는 거부한다)
  python backend/scripts/backfill_diary_topics.py --apply-dsn postgresql://postgres@localhost:55432/postgres
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "ai" / "data" / "service" / "topics"
# backend/app/schemas/diary.py Topic 과 같은 값
TOPICS = {"travel", "relationship", "study_achievement", "rest_daily", "challenge_activity", "other"}
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def collect(topic_dir: Path) -> tuple[list[tuple[str, str, str]], list[str]]:
    """(user_id, diary_id, topic) 목록과 건너뛴 이유 목록."""
    rows: list[tuple[str, str, str]] = []
    skipped: list[str] = []
    users = topic_dir / "users"
    if not users.exists():
        return rows, [f"폴더 없음: {users}"]
    for path in sorted(users.glob("*/topics.json")):
        user_id = path.parent.name
        if not _UUID.match(user_id):
            skipped.append(f"{path}: 사용자 id 형식이 아님")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            skipped.append(f"{path}: 읽기 실패 ({exc})")
            continue
        if not isinstance(data, dict):
            skipped.append(f"{path}: 형식이 dict 가 아님")
            continue
        for diary_id, topic in sorted(data.items()):
            if not _UUID.match(str(diary_id)):
                skipped.append(f"{user_id}/{diary_id}: 일기 id 형식이 아님")
            elif topic not in TOPICS:
                skipped.append(f"{user_id}/{diary_id}: 모르는 주제 {topic!r}")
            else:
                rows.append((user_id.lower(), str(diary_id).lower(), topic))
    return rows, skipped


def to_sql(rows: list[tuple[str, str, str]]) -> str:
    # 값은 위에서 UUID 정규식·주제 목록으로 검사했으므로 따옴표 문제가 없다.
    lines = [
        "-- backfill_diary_topics.py 가 만든 파일. migrations/2026-11-13_diary_topic.sql 실행 후 검토하고 실행한다.",
        "-- id·user_id 가 모두 맞고 topic 이 비어 있는 행만 바꾼다(다른 사람 일기·이미 정한 주제는 그대로).",
        "begin;",
    ]
    for user_id, diary_id, topic in rows:
        lines.append(
            f"update diaries set topic = '{topic}' "
            f"where id = '{diary_id}'::uuid and user_id = '{user_id}'::uuid and topic is null;"
        )
    lines.append("commit;")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--topic-dir", type=Path, default=DEFAULT_DIR)
    ap.add_argument("--out", type=Path, help="UPDATE 문을 쓸 SQL 파일")
    ap.add_argument("--apply-dsn", help="로컬 검증용 Postgres DSN (localhost/127.0.0.1 만 허용)")
    args = ap.parse_args(argv)

    rows, skipped = collect(args.topic_dir)
    users = len({r[0] for r in rows})
    print(f"옮길 주제 {len(rows)}개 (사용자 {users}명), 건너뜀 {len(skipped)}개")
    for s in skipped:
        print("  건너뜀:", s)

    sql = to_sql(rows)
    if args.out:
        args.out.write_text(sql, encoding="utf-8")
        print(f"SQL 파일: {args.out}")
    if args.apply_dsn:
        if not re.search(r"@(localhost|127\.0\.0\.1)(:\d+)?/", args.apply_dsn):
            print("거부: --apply-dsn 은 로컬 DB(localhost)만 허용한다. 운영 DB에는 SQL 파일을 검토 후 직접 실행한다.")
            return 2
        import psycopg  # 로컬 검증 때만 필요

        with psycopg.connect(args.apply_dsn, autocommit=True) as conn:
            conn.execute(sql)
        print("로컬 DB에 적용함")
    return 0


if __name__ == "__main__":
    sys.exit(main())
