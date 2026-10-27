"""AI 서비스(ai/service/app.py)의 2단계 API를 실제 모델로 점검한다(서버를 띄우지 않고 FastAPI TestClient 사용).

점검: /health, /layout/add(첫 일기·관련 일기·관련 없는 일기·같은 ID 재요청), 기존 좌표 유지,
      /layout/related, /layout/update(좌표 유지), /layout/remove, 서버 재시작(저장소 재로딩) 뒤 좌표 동일, 잘못된 user_id 거부.
저장소는 임시 폴더(ai/outputs/service_check/, Git 제외)를 쓰므로 실제 서비스 저장소와 섞이지 않는다.

사용 예 (저장소 루트에서):
    .venv/Scripts/python ai/scripts/check_service_layout.py
"""
from __future__ import annotations

import importlib
import os
import sys
import uuid
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

DIARIES = [
    "다음 주 수학 중간고사인데 미적분이 하나도 이해가 안 돼서 불안하다.",
    "수학 중간고사 점수가 생각보다 잘 나왔다. 밤마다 문제 푼 보람이 있다.",
    "베란다 화분에 심은 방울토마토가 처음으로 빨갛게 익었다.",
]


def main() -> int:
    run_dir = AI_ROOT / "outputs" / "service_check" / uuid.uuid4().hex[:8]
    os.environ["AI_LAYOUT_DATA_DIR"] = str(run_dir)
    os.environ.pop("AI_SERVICE_TOKEN", None)
    from fastapi.testclient import TestClient

    import service.app as svc
    checks = {}
    user = str(uuid.uuid4())
    with TestClient(svc.app) as client:
        h = client.get("/health").json()
        print("health:", h.get("layout"))
        checks["health_has_layout"] = "layout" in h
        res = [client.post("/layout/add", json={"user_id": user, "diary_id": f"d{i}", "text": t}).json()
               for i, t in enumerate(DIARIES)]
        for i, r in enumerate(res):
            print(f"add d{i}: created={r['created']} rule={r['rule']} star={ {k: round(v, 2) for k, v in r['star'].items()} } related={r['related']}")
        checks["first_has_no_related"] = res[0]["related"] == [] and res[0]["rule"] == "first_star_pca"
        checks["second_related_to_first"] = [x["diary_id"] for x in res[1]["related"]] == ["d0"]
        checks["unrelated_has_no_related"] = res[2]["related"] == []
        dup = client.post("/layout/add", json={"user_id": user, "diary_id": "d0", "text": "다른 내용"}).json()
        checks["duplicate_not_recreated"] = dup["created"] is False and dup["star"] == res[0]["star"]
        rel = client.post("/layout/related", json={"user_id": user, "diary_id": "d0"}).json()
        checks["related_endpoint"] = [x["diary_id"] for x in rel["related"]] == ["d1"]
        upd = client.post("/layout/update", json={"user_id": user, "diary_id": "d2", "text": "수학 시험 공부를 했다."}).json()
        checks["update_keeps_position"] = upd["star"] == res[2]["star"]
        rm = client.post("/layout/remove", json={"user_id": user, "diary_id": "d1"}).json()
        checks["remove"] = rm["removed"] is True
        checks["missing_related_404"] = client.post("/layout/related", json={"user_id": user, "diary_id": "d1"}).status_code == 404
        checks["bad_user_id_rejected"] = client.post("/layout/add", json={"user_id": "../../etc", "diary_id": "x", "text": "a"}).status_code == 422

    # 서버 재시작: 모듈을 다시 불러와 디스크 저장소에서 좌표를 읽는다
    svc = importlib.reload(svc)
    with TestClient(svc.app) as client:
        again = client.post("/layout/add", json={"user_id": user, "diary_id": "d0", "text": "x"}).json()
        checks["coords_same_after_restart"] = again["created"] is False and again["star"] == res[0]["star"]
        d2 = client.post("/layout/add", json={"user_id": user, "diary_id": "d2", "text": "x"}).json()
        checks["updated_embedding_persisted"] = [x["diary_id"] for x in d2["related"]] == ["d0"]

    print("\n점검 결과")
    for k, v in checks.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    print("임시 저장소:", run_dir.relative_to(AI_ROOT.parent).as_posix())
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
