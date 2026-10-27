"""오늘의별일 AI 추론 서비스 (FastAPI).

백엔드가 일기를 저장할 때 HTTP로 호출해 별의 색·밝기와 감정 분석 결과(1단계),
별의 3D 좌표와 관련 기억(2단계)을 받는다.
백엔드와 분리된 별도 서버로 띄우며, 이 서버가 꺼져 있어도 백엔드는 기본값(무작위 위치·흰색)으로 별을 만든다.

실행 (저장소 루트):
    .venv/Scripts/python -m uvicorn --app-dir ai service.app:app --host 0.0.0.0 --port 8100

환경변수
    AI_SERVICE_TOKEN   설정하면 요청 헤더 `X-AI-Token`이 같아야만 응답한다(백엔드와 같은 값).
    AI_DEVICE          "cpu" 또는 "cuda" (기본: 가능하면 cuda)
    AI_ENABLE_LAYOUT   "0"이면 2단계(좌표·관련 기억) 기능을 끈다(기본: 켬)
    AI_LAYOUT_DATA_DIR 사용자별 좌표 저장소 위치(기본: configs/service.json의 positioning.data_dir). 테스트용
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from src.data.paths import configure_hf_cache, get_paths  # noqa: E402

configure_hf_cache(get_paths(AI_ROOT))

from fastapi import Depends, FastAPI, Header, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from src.data.paths import load_json  # noqa: E402
from src.emotion.pipeline import DiaryEmotionPipeline  # noqa: E402

app = FastAPI(title="오늘의별일 AI", version="0.2")
_pipeline: DiaryEmotionPipeline | None = None
_layout = None


def _device() -> str:
    if os.environ.get("AI_DEVICE"):
        return os.environ["AI_DEVICE"]
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def get_pipeline() -> DiaryEmotionPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = DiaryEmotionPipeline(AI_ROOT, device=os.environ.get("AI_DEVICE") or None)
    return _pipeline


def layout_enabled() -> bool:
    return os.environ.get("AI_ENABLE_LAYOUT", "1") != "0"


def get_layout():
    global _layout
    if not layout_enabled():
        raise HTTPException(status_code=503, detail="layout disabled")
    if _layout is None:
        from src.positioning.service_layout import UserLayoutService
        _layout = UserLayoutService(AI_ROOT, load_json(AI_ROOT / "configs" / "service.json"), device=_device(),
                                    data_dir=os.environ.get("AI_LAYOUT_DATA_DIR") or None)
    return _layout


def check_token(x_ai_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("AI_SERVICE_TOKEN", "")
    if expected and x_ai_token != expected:
        raise HTTPException(status_code=401, detail="invalid AI token")


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1)


class AnalyzeBatchRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class LayoutItem(BaseModel):
    user_id: str = Field(min_length=8, max_length=64)
    diary_id: str = Field(min_length=1, max_length=64)


class LayoutTextItem(LayoutItem):
    text: str = Field(min_length=1)


@app.on_event("startup")
def _load_models() -> None:
    get_pipeline()  # 첫 요청이 느려지지 않도록 시작할 때 모델을 올린다
    if layout_enabled():
        get_layout()


@app.get("/health")
def health():
    p = get_pipeline()
    out = {"status": "ok", "models": p.model_names, "num_labels": len(p.labels),
           "mapping_version": p.mapping["version"]}
    if layout_enabled():
        lay = get_layout()
        out["layout"] = {"embedding_version": lay.embedding_version, "layout_version": lay.layout_version,
                         "device": lay.encoder.device}
    return out


@app.post("/analyze", dependencies=[Depends(check_token)])
def analyze(req: AnalyzeRequest):
    return get_pipeline().analyze([req.text])[0]


@app.post("/analyze/batch", dependencies=[Depends(check_token)])
def analyze_batch(req: AnalyzeBatchRequest):
    return {"results": get_pipeline().analyze(req.texts)}


# ---------------------------------------------------------------- 2단계: 좌표·관련 기억
def _bad_request(exc: ValueError):
    raise HTTPException(status_code=422, detail=str(exc))


@app.post("/layout/add", dependencies=[Depends(check_token)])
def layout_add(req: LayoutTextItem):
    """새 일기 → 3D 좌표 + 관련 기억(코사인 ≥ τ, 최대 3개). 같은 diary_id 재요청은 저장된 좌표를 그대로 준다."""
    try:
        return get_layout().add(req.user_id, req.diary_id, req.text[: get_pipeline().cfg["max_text_chars"]])
    except ValueError as exc:
        _bad_request(exc)


@app.post("/layout/update", dependencies=[Depends(check_token)])
def layout_update(req: LayoutTextItem):
    """수정된 일기: 관련 기억 검색용 임베딩만 바꾸고 좌표는 그대로 둔다."""
    try:
        out = get_layout().update(req.user_id, req.diary_id, req.text[: get_pipeline().cfg["max_text_chars"]])
    except ValueError as exc:
        _bad_request(exc)
    if out is None:
        raise HTTPException(status_code=404, detail="diary not in layout")
    return out


@app.post("/layout/remove", dependencies=[Depends(check_token)])
def layout_remove(req: LayoutItem):
    try:
        return {"removed": get_layout().remove(req.user_id, req.diary_id)}
    except ValueError as exc:
        _bad_request(exc)


@app.post("/layout/related", dependencies=[Depends(check_token)])
def layout_related(req: LayoutItem):
    """저장된 일기의 관련 기억(같은 사용자 일기 중 코사인 ≥ τ, 최대 3개). 없으면 빈 목록."""
    try:
        out = get_layout().related(req.user_id, req.diary_id)
    except ValueError as exc:
        _bad_request(exc)
    if out is None:
        raise HTTPException(status_code=404, detail="diary not in layout")
    return {"related": out}
