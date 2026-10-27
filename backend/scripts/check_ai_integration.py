"""백엔드 ↔ AI 서비스 연동 점검 (DB 없이).

실행 중인 AI 서비스(ai/service)에 실제 HTTP로 요청하고, Supabase 대신 메모리 가짜 DB를 써서
일기 작성 → 별 좌표·색 → 관련 기억 → 수정 → 삭제 흐름을 백엔드 코드(app.routers.diaries) 그대로 실행한다.
운영 DB에는 아무것도 쓰지 않는다.

사용 예 (backend/ 에서, AI 서비스가 http://127.0.0.1:8100 에 떠 있을 때):
    set ADMIN_JWT_SECRET=local-check  (PowerShell: $env:ADMIN_JWT_SECRET="local-check")
    .venv/Scripts/python scripts/check_ai_integration.py --ai-url http://127.0.0.1:8100 --token <AI_SERVICE_TOKEN>
"""
from __future__ import annotations

import argparse
import itertools
import math
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("ADMIN_JWT_SECRET", "local-check")
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "local-check")

from app import ai_client  # noqa: E402
from app.routers import diaries, stars  # noqa: E402
from app.schemas.diary import DiaryCreate, DiaryUpdate  # noqa: E402


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """supabase-py 쿼리 빌더 중 이 라우터가 쓰는 부분만 흉내 낸 메모리 DB."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self.op, self.payload, self.filters, self.in_filter, self.order_key = "select", None, [], None, None

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def in_(self, field, values):
        self.in_filter = (field, set(values))
        return self

    def order(self, key, desc=False):
        self.order_key = (key, desc)
        return self

    def _match(self, row):
        for f, v in self.filters:
            if f == "diaries.user_id":
                d = next((x for x in self.db["diaries"] if x["id"] == row["diary_id"]), None)
                if not d or d["user_id"] != v:
                    return False
            elif row.get(f) != v:
                return False
        return self.in_filter is None or row.get(self.in_filter[0]) in self.in_filter[1]

    def execute(self):
        table = self.db[self.name]
        now = datetime.now(timezone.utc).isoformat()
        if self.op == "insert":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for r in rows:
                r = {"id": str(uuid.uuid4()), **r}
                if self.name == "diaries":
                    r.setdefault("created_at", now)
                    r.setdefault("updated_at", now)
                if self.name == "stars":
                    r = {"color": "#ffffff", "brightness": 1.0, **r}
                table.append(r)
                out.append(dict(r))
            return _Result(out)
        matched = [r for r in table if self._match(r)]
        if self.op == "update":
            for r in matched:
                r.update(self.payload)
            return _Result([dict(r) for r in matched])
        if self.op == "delete":
            ids = {r["id"] for r in matched}
            self.db[self.name] = [r for r in table if r["id"] not in ids]
            if self.name == "diaries":   # on delete cascade
                self.db["stars"] = [s for s in self.db["stars"] if s["diary_id"] not in ids]
            return _Result([])
        return _Result([dict(r) for r in matched])


class FakeSupabase:
    def __init__(self):
        self.db = {"diaries": [], "stars": [], "groups": [], "diary_groups": []}

    def table(self, name):
        return _Query(self.db, name)


DIARIES = [
    "다음 주 수학 중간고사인데 미적분 단원이 하나도 이해가 안 된다. 이러다 시험 망칠 것 같아서 불안하다.",
    "수학 중간고사 점수가 나왔는데 생각보다 훨씬 잘 봤다. 그동안 밤마다 문제 푼 게 헛되지 않았다.",
    "유기견 보호소에서 강아지를 입양했다. 처음엔 구석에서 떨기만 하더니 저녁쯤 내 손을 핥아줬다.",
    "강아지가 새벽마다 낑낑대서 잠을 못 잤다. 내가 잘 키울 수 있을지 걱정이다.",
    "베란다 화분에 심은 방울토마토가 처음으로 빨갛게 익었다.",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ai-url", default="http://127.0.0.1:8100")
    ap.add_argument("--token", default=os.environ.get("AI_SERVICE_TOKEN", ""))
    args = ap.parse_args()
    ai_client.settings.ai_service_url = args.ai_url
    ai_client.settings.ai_service_token = args.token
    ai_client.settings.ai_service_timeout = 30.0

    fake = FakeSupabase()
    diaries.supabase = stars.supabase = fake
    user = str(uuid.uuid4())
    checks, ids, history = {}, [], []

    for text in DIARIES:
        before = {s["diary_id"]: (s["x"], s["y"], s["z"]) for s in fake.db["stars"]}
        d = diaries.create_diary(DiaryCreate(content=text), user_id=user)
        ids.append(d["id"])
        after = {s["diary_id"]: (s["x"], s["y"], s["z"]) for s in fake.db["stars"]}
        history.append(all(after[k] == v for k, v in before.items()))
    star_rows = stars.list_stars(user_id=user)
    by_diary = {s["diary_id"]: s for s in star_rows}
    print("별 목록 (GET /stars와 같은 함수)")
    for i, did in enumerate(ids):
        s = by_diary[did]
        print(f"  일기{i + 1}: xyz=({s['x']:.2f}, {s['y']:.2f}, {s['z']:.2f}) color={s['color']} brightness={s['brightness']} | {DIARIES[i][:22]}…")
    checks["every_diary_has_a_star"] = len(star_rows) == len(DIARIES)
    checks["stars_have_ai_color"] = all(s["color"] != "#ffffff" for s in star_rows)
    checks["existing_stars_never_moved"] = all(history)

    def dist(a, b):
        return math.dist((by_diary[a]["x"], by_diary[a]["y"], by_diary[a]["z"]), (by_diary[b]["x"], by_diary[b]["y"], by_diary[b]["z"]))

    pair_d = [dist(a, b) for a, b in itertools.combinations(ids, 2)]
    print(f"  수학 두 일기 거리 {dist(ids[0], ids[1]):.2f} · 강아지 두 일기 거리 {dist(ids[2], ids[3]):.2f} · 전체 쌍 평균 {sum(pair_d) / len(pair_d):.2f}")

    rel = {i: diaries.get_related_diaries(uuid.UUID(did), user_id=user) for i, did in enumerate(ids)}
    print("관련 기억 (GET /diaries/{id}/related)")
    for i, r in rel.items():
        names = [f"일기{ids.index(x['diary_id']) + 1}({x['similarity']:.3f})" for x in r]
        print(f"  일기{i + 1} → {names or '없음'}")
    # 모델 판단 결과(관찰값): 연동 규칙의 통과/실패와 따로 보여 준다
    observations = {
        "수학 두 일기가 서로 관련 기억": ids[1] in [x["diary_id"] for x in rel[0]],
        "강아지 두 일기가 서로 관련 기억": ids[2] in [x["diary_id"] for x in rel[3]],
        "방울토마토 일기는 관련 기억 없음": rel[4] == [],
    }

    pos_before = {s["diary_id"]: (s["x"], s["y"], s["z"]) for s in fake.db["stars"]}
    diaries.update_diary(uuid.UUID(ids[4]), DiaryUpdate(content="수학 시험 공부를 하다가 방울토마토에 물을 줬다."), user_id=user)
    pos_after = {s["diary_id"]: (s["x"], s["y"], s["z"]) for s in fake.db["stars"]}
    checks["update_keeps_positions"] = pos_before == pos_after
    rel4 = diaries.get_related_diaries(uuid.UUID(ids[4]), user_id=user)
    print("  수정 후 일기5 →", [f"일기{ids.index(x['diary_id']) + 1}({x['similarity']:.3f})" for x in rel4] or "없음")

    diaries.delete_diary(uuid.UUID(ids[1]), user_id=user)
    rel0 = diaries.get_related_diaries(uuid.UUID(ids[0]), user_id=user)
    checks["deleted_diary_not_related"] = ids[1] not in [x["diary_id"] for x in rel0]
    checks["delete_keeps_other_positions"] = all(
        (s["x"], s["y"], s["z"]) == pos_after[s["diary_id"]] for s in fake.db["stars"])

    # AI 서비스가 꺼진 상황: 무작위 위치로 일기 저장은 계속 성공
    ai_client.settings.ai_service_url = "http://127.0.0.1:9"
    ai_client.settings.ai_service_timeout = 1.0
    d = diaries.create_diary(DiaryCreate(content="AI 서비스가 꺼져 있어도 일기는 저장된다."), user_id=user)
    s = next(x for x in fake.db["stars"] if x["diary_id"] == d["id"])
    r = math.sqrt(s["x"] ** 2 + s["y"] ** 2 + s["z"] ** 2)
    checks["ai_down_still_saves_with_random_position"] = 3 - 1e-6 <= r <= 12 + 1e-6 and s["color"] == "#ffffff"

    print("\n연동 규칙 점검")
    for k, v in checks.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    print("모델 판단 관찰(τ 경계에 따라 달라질 수 있음, 통과 집계 제외)")
    for k, v in observations.items():
        print(f"  {'예' if v else '아니오'}  {k}")
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
