from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin_auth, admin_data, auth, diaries, profiles, stars, uploads

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
app.include_router(profiles.router)
app.include_router(diaries.router)
app.include_router(stars.router)
app.include_router(uploads.router)


@app.get("/health")
def health():
    return {"status": "ok"}
