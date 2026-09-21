from fastapi import FastAPI

from app.routers import diaries, profiles, stars

app = FastAPI(title="Diary Galaxy API")

app.include_router(profiles.router)
app.include_router(diaries.router)
app.include_router(stars.router)


@app.get("/health")
def health():
    return {"status": "ok"}
