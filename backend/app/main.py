from fastapi import FastAPI

from app.routers import admin_auth, auth, diaries, profiles, stars

app = FastAPI(title="Diary Galaxy API")

app.include_router(auth.router)
app.include_router(admin_auth.router)
app.include_router(profiles.router)
app.include_router(diaries.router)
app.include_router(stars.router)


@app.get("/health")
def health():
    return {"status": "ok"}
