from fastapi import APIRouter, Depends

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.group import Group, GroupCreate

router = APIRouter(prefix="/groups", tags=["groups"])


def _with_diary_ids(group: dict) -> dict:
    diary_groups = group.pop("diary_groups", None) or []
    return {**group, "diary_ids": [dg["diary_id"] for dg in diary_groups]}


@router.get("", response_model=list[Group])
def list_groups(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("groups")
        .select("*, diary_groups(diary_id)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_with_diary_ids(g) for g in result.data]


@router.post("", response_model=Group)
def create_group(group: GroupCreate, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("groups")
        .insert({"user_id": user_id, "name": group.name})
        .execute()
    )
    return _with_diary_ids({**result.data[0], "diary_groups": []})
