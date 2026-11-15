import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    admin_auth,
    admin_data,
    admin_shop,
    auth,
    constellations,
    diaries,
    groups,
    legal,
    profiles,
    quests,
    shop,
    stars,
    uploads,
)

# [2026-11-15] 앱 자체 로그(app.*)만 INFO 로 출력한다 — LLM 호출 수·토큰·비용 추적(내용·키는 남기지 않음).
# 다른 라이브러리 로그 수준은 바꾸지 않는다.
_app_log = logging.getLogger("app")
if not _app_log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    _app_log.addHandler(_handler)
    _app_log.setLevel(logging.INFO)

app = FastAPI(title="Diary Galaxy API")

# 프론트엔드 배포 주소가 아직 확정되지 않아 전체 허용. 인증은 쿠키가 아니라
# Authorization 헤더로 하므로 allow_credentials 없이도 안전하게 동작함.
# 도메인이 정해지면 allow_origins를 그 목록으로 좁힐 것.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin_auth.router)
app.include_router(admin_data.router)
app.include_router(admin_shop.router)
app.include_router(profiles.router)
app.include_router(diaries.router)
app.include_router(groups.router)
app.include_router(stars.router)
app.include_router(constellations.router)
app.include_router(uploads.router)
app.include_router(shop.router)
app.include_router(quests.router)
app.include_router(legal.router)


@app.get("/health")
def health():
    return {"status": "ok"}
