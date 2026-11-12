import secrets
import string

from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.group import Group, GroupCreate, GroupJoin, GroupMember

router = APIRouter(prefix="/groups", tags=["groups"])

# 공유용 방 ID(초대 코드). 헷갈리는 0/O, 1/I 는 뺀다.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def _nicknames(user_ids: list[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = (
        supabase.table("profiles")
        .select("user_id, nickname")
        .in_("user_id", user_ids)
        .execute()
        .data
    )
    return {r["user_id"]: r["nickname"] for r in rows}


def _members_by_group(group_ids: list[str]) -> dict[str, list[dict]]:
    if not group_ids:
        return {}
    rows = (
        supabase.table("group_members")
        .select("group_id, user_id, joined_at")
        .in_("group_id", group_ids)
        .order("joined_at")
        .execute()
        .data
    )
    nick = _nicknames([r["user_id"] for r in rows])
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r["group_id"], []).append(
            {"user_id": r["user_id"], "nickname": nick.get(r["user_id"])}
        )
    return out


def _shape(group: dict, members_by_group: dict[str, list[dict]]) -> dict:
    diary_groups = group.pop("diary_groups", None) or []
    return {
        **group,
        "diary_ids": [dg["diary_id"] for dg in diary_groups],
        "members": members_by_group.get(group["id"], []),
    }


def _assert_member(group_id: str, user_id: str) -> None:
    row = (
        supabase.table("group_members")
        .select("user_id")
        .eq("group_id", group_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")


def _unique_invite_code() -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        exists = supabase.table("groups").select("id").eq("invite_code", code).execute().data
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="초대 코드를 만들지 못했어요. 다시 시도해주세요.")


@router.get("", response_model=list[Group])
def list_groups(user_id: str = Depends(get_current_user_id)):
    """내가 소유했거나 참여한 그룹 전부."""
    member_rows = (
        supabase.table("group_members").select("group_id").eq("user_id", user_id).execute().data
    )
    group_ids = [m["group_id"] for m in member_rows]
    if not group_ids:
        return []
    result = (
        supabase.table("groups")
        .select("*, diary_groups(diary_id)")
        .in_("id", group_ids)
        .order("created_at", desc=True)
        .execute()
    )
    members_by_group = _members_by_group(group_ids)
    return [_shape(g, members_by_group) for g in result.data]


@router.post("", response_model=Group)
def create_group(group: GroupCreate, user_id: str = Depends(get_current_user_id)):
    name = group.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="그룹 이름을 입력해주세요.")
    code = _unique_invite_code()
    result = (
        supabase.table("groups")
        .insert({"user_id": user_id, "name": name, "invite_code": code})
        .execute()
    )
    created = result.data[0]
    # 소유자 멤버십이 없으면 접근 자체가 막히므로(권한은 group_members 기준), 실패하면 그룹을 되돌린다.
    # shortcut: 두 insert 사이에 프로세스가 죽으면 유령 그룹이 남는다(드묾). 원자성이 필요하면 DB RPC로 합칠 것.
    try:
        supabase.table("group_members").insert(
            {"group_id": created["id"], "user_id": user_id}
        ).execute()
    except Exception:
        supabase.table("groups").delete().eq("id", created["id"]).execute()
        raise HTTPException(status_code=500, detail="그룹을 만들지 못했어요. 다시 시도해주세요.")
    return _shape({**created, "diary_groups": []}, _members_by_group([created["id"]]))


@router.post("/join", response_model=Group)
def join_group(body: GroupJoin, user_id: str = Depends(get_current_user_id)):
    """방 ID(초대 코드)로 그룹에 바로 참여(즉시 멤버)."""
    code = body.invite_code.strip().upper()
    found = (
        supabase.table("groups")
        .select("*, diary_groups(diary_id)")
        .eq("invite_code", code)
        .execute()
        .data
    )
    if not found:
        raise HTTPException(status_code=404, detail="그 코드의 그룹을 찾을 수 없어요.")
    group = found[0]
    supabase.table("group_members").upsert(
        {"group_id": group["id"], "user_id": user_id}, on_conflict="group_id,user_id"
    ).execute()
    return _shape(group, _members_by_group([group["id"]]))


@router.get("/{group_id}/members", response_model=list[GroupMember])
def list_members(group_id: str, user_id: str = Depends(get_current_user_id)):
    _assert_member(group_id, user_id)
    return _members_by_group([group_id]).get(group_id, [])
