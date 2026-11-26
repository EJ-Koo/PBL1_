import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("reanalyze_planets", Path(__file__).resolve().parents[1] / "scripts/reanalyze_planets.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class DB:
    def __init__(self, rows):
        self.rows, self.writes, self.filters = rows, [], []

    def table(self, name):
        assert name == "stars"
        return Query(self)


class Query:
    def __init__(self, db):
        self.db, self.start, self.end, self.patch, self.matches = db, 0, 199, None, []

    def select(self, columns):
        assert "content" in columns
        return self

    def order(self, key):
        return self

    def range(self, start, end):
        self.start, self.end = start, end
        return self

    def eq(self, key, value):
        self.matches.append((key, value))
        self.db.filters.append((key, value))
        return self

    def update(self, patch):
        self.patch = patch
        return self

    def execute(self):
        if self.patch is not None:
            self.db.writes.append((self.matches, self.patch))
            rows = []
        else:
            rows = self.db.rows[self.start:self.end + 1]
        return type("Result", (), {"data": rows})()


def row(i, text="private diary body"):
    return {"id": str(i), "color": "#FFFFFF", "brightness": 1, "diaries": {"content": text, "user_id": "owner"}}


def result(state="clear"):
    return {"star": {"color": "#abc123", "brightness": 1.2}, "visual": {"state": state}}


def test_audit_scans_all_pages_without_writing_or_logging_diaries(capsys):
    db = DB([row(i) for i in range(205)])
    counts = audit.run_audit(db, lambda texts: [result() for _ in texts], user_id="owner")
    assert counts["total"] == counts["clear"] == counts["changed"] == 205
    assert db.writes == []
    assert ("diaries.user_id", "owner") in db.filters
    assert "private diary body" not in capsys.readouterr().out


def test_apply_updates_only_color_and_brightness_and_preserves_neutral_results():
    db = DB([row(1), row(2), row(3, "")])
    counts = audit.run_audit(db, lambda texts: [result("none"), result("muted")], apply=True)
    assert counts["updated"] == 2
    assert counts["none"] == counts["muted"] == counts["empty"] == 1
    for matches, patch in db.writes:
        assert set(patch) == {"color", "brightness"}
        assert matches[0][0] == "id"


def test_failed_analysis_never_overwrites_saved_planets():
    db = DB([row(1), row(2)])
    counts = audit.run_audit(db, lambda texts: [result()], apply=True)
    assert counts["failed"] == 2
    assert not db.writes


@pytest.mark.parametrize("bad", [
    {"star": {"color": "red", "brightness": 1}, "visual": {"state": "clear"}},
    {"star": {"color": "#123456", "brightness": float("nan")}, "visual": {"state": "clear"}},
    {"star": {"color": "#123456", "brightness": 1}, "visual": {"state": "unknown"}},
])
def test_invalid_outputs_cannot_be_written(bad):
    with pytest.raises(ValueError):
        audit.analyze_result(bad)
