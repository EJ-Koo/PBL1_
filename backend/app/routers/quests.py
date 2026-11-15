from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.quest import DailyQuestStatus

router = APIRouter(prefix='/me/quests', tags=['quests'])


def sync_daily_quest(user_id: str, reset: bool = False) -> DailyQuestStatus:
    try:
        result = supabase.rpc('sync_daily_quest', {'p_user': user_id, 'p_reset': reset}).execute().data
    except APIError as error:
        if 'test_reset_disabled' in (error.message or ''):
            raise HTTPException(status_code=403, detail='개발용 퀘스트 초기화가 꺼져 있어요.')
        if error.code in ('PGRST202', 'PGRST205', '42883', '42P01'):
            raise HTTPException(status_code=503, detail='퀘스트 SQL이 아직 적용되지 않았어요. 2026-11-15_daily_quest.sql을 적용해주세요.')
        raise HTTPException(status_code=502, detail='퀘스트를 처리하지 못했어요. 잠시 후 다시 시도해주세요.')
    except Exception:
        raise HTTPException(status_code=502, detail='퀘스트 서버 연결을 확인해주세요. 일기는 다시 작성하지 않아도 됩니다.')
    try:
        return DailyQuestStatus.model_validate(result)
    except ValueError:
        raise HTTPException(status_code=502, detail='퀘스트 결과를 확인하지 못했어요. 다시 불러와주세요.')


@router.post('/sync', response_model=DailyQuestStatus)
def sync_my_quest(user_id: str = Depends(get_current_user_id)):
    return sync_daily_quest(user_id)


@router.post('/reset', response_model=DailyQuestStatus)
def reset_my_quest(user_id: str = Depends(get_current_user_id)):
    # DB 함수가 같은 트랜잭션 안에서 allow_test_reset을 검사합니다.
    return sync_daily_quest(user_id, reset=True)
