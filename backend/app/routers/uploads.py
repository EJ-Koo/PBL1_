import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.db import supabase
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/uploads", tags=["uploads"])

PHOTO_BUCKET = "diary-photos"
MAX_PHOTO_SIZE = 10 * 1024 * 1024


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")

    content = await file.read()
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기는 10MB를 넘을 수 없습니다.")

    ext = Path(file.filename or "").suffix or ".jpg"
    path = f"{user_id}/{uuid.uuid4()}{ext}"

    try:
        supabase.storage.from_(PHOTO_BUCKET).upload(
            path, content, {"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"사진 업로드에 실패했습니다: {e}")

    return {"photo_path": path}
