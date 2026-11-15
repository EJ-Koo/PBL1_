"""[ADDED 2026-11-13] AI 서비스 주제 JSON → diaries.topic backfill SQL 생성(backend/scripts/backfill_diary_topics.py)."""
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "backfill_diary_topics", Path(__file__).resolve().parents[1] / "scripts" / "backfill_diary_topics.py"
)
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)

U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"
D1 = "aaaaaaaa-0000-0000-0000-000000000001"
D2 = "aaaaaaaa-0000-0000-0000-000000000002"


def _write(tmp_path, user, data):
    d = tmp_path / "users" / user
    d.mkdir(parents=True)
    (d / "topics.json").write_text(json.dumps(data), encoding="utf-8")


def test_collect_validates_ids_and_topics(tmp_path):
    _write(tmp_path, U1, {D1: "travel", D2: "not-a-topic", "x'; drop table diaries;--": "travel"})
    _write(tmp_path, U2, {D2: "rest_daily"})
    _write(tmp_path, "not-a-user", {D1: "travel"})
    rows, skipped = backfill.collect(tmp_path)
    assert rows == [(U1, D1, "travel"), (U2, D2, "rest_daily")]
    assert len(skipped) == 3


def test_sql_only_fills_empty_topics_of_the_owner(tmp_path):
    sql = backfill.to_sql([(U1, D1, "travel")])
    assert sql.splitlines()[2] == "begin;" and sql.strip().endswith("commit;")
    line = [ln for ln in sql.splitlines() if ln.startswith("update")][0]
    assert f"id = '{D1}'::uuid" in line and f"user_id = '{U1}'::uuid" in line and "topic is null" in line


def test_main_writes_file_and_refuses_remote_dsn(tmp_path, capsys):
    _write(tmp_path, U1, {D1: "travel"})
    out = tmp_path / "out.sql"
    assert backfill.main(["--topic-dir", str(tmp_path), "--out", str(out)]) == 0
    assert "update diaries set topic = 'travel'" in out.read_text(encoding="utf-8")
    remote = "postgresql://postgres:pw@db.example.supabase.co:5432/postgres"
    assert backfill.main(["--topic-dir", str(tmp_path), "--apply-dsn", remote]) == 2
    assert "거부" in capsys.readouterr().out
