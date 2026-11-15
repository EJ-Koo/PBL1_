import secrets
import string
from uuid import uuid5, NAMESPACE_URL
from postgrest.exceptions import APIError

from fastapi import APIRouter, Depends, HTTPException, Response

from app import ai_client
from app.db import supabase
from app.dependencies import get_current_user_id
from app.routers.shop import applied_effects
from app.schemas.group import Group, GroupCreate, GroupJoin, GroupMember, GroupStarEntry

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
    # Existing groups.id primary key provides cross-worker retry protection; no new SQL needed.
    group_id = str(uuid5(NAMESPACE_URL, f'star2day:group:{user_id}:{group.request_id}')) if group.request_id else None
    existing = supabase.table('groups').select('*, diary_groups(diary_id)').eq('id', group_id).eq('user_id', user_id).execute().data if group_id else []
    if existing:
        created = existing[0]
        if created['name'] != name:
            raise HTTPException(status_code=409, detail='다른 이름으로 재시도하려면 새 그룹 만들기를 열어주세요.')
    else:
        row = {"user_id": user_id, "name": name, "invite_code": _unique_invite_code()}
        if group_id:
            row['id'] = group_id
        try:
            created = supabase.table('groups').insert(row).execute().data[0]
        except APIError as error:
            if not group_id or error.code != '23505':
                raise
            # A concurrent request may have inserted the same action first.
            found = supabase.table('groups').select('*, diary_groups(diary_id)').eq('id', group_id).eq('user_id', user_id).execute().data
            if not found or found[0]['name'] != name:
                raise HTTPException(status_code=409, detail='그룹 생성 결과를 확인해주세요.')
            created = found[0]
    # A retry can repair owner membership without creating another group.
    try:
        supabase.table("group_members").upsert(
            {"group_id": created["id"], "user_id": user_id},
            on_conflict='group_id,user_id').execute()
    except Exception:
        # Preserve an idempotent row so the same action can repair owner membership on retry.
        if not group_id:
            supabase.table("groups").delete().eq("id", created["id"]).execute()
        raise HTTPException(status_code=500, detail="그룹을 만들지 못했어요. 다시 시도해주세요.")
    return _shape({**created, "diary_groups": created.get("diary_groups", [])}, _members_by_group([created["id"]]))


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


@router.get("/{group_id}/stars", response_model=list[GroupStarEntry])
def group_stars(group_id: str, user_id: str = Depends(get_current_user_id)):
    """그룹 공유 우주: 멤버 전체가 이 그룹에 태그한 일기의 별을 돌려준다(작성자 닉네임 포함).
    멤버만 볼 수 있다. 일기 '태그=그룹에 공유'로 보고 작성자 구분 없이 모두 반환한다."""
    _assert_member(group_id, user_id)
    tag_rows = (
        supabase.table("diary_groups").select("diary_id").eq("group_id", group_id).execute().data
    )
    diary_ids = [t["diary_id"] for t in tag_rows]
    if not diary_ids:
        return []
    star_rows = (
        supabase.table("stars")
        .select("*, diaries!inner(id, content, created_at, user_id, visibility)")
        .in_("diary_id", diary_ids)
        .execute()
        .data
    )
    # Never return a private diary, even if an old tag still exists.
    star_rows = [r for r in star_rows if (r.get("diaries") or {}).get("visibility", "private") != "private"]
    author_ids = list({(r.get("diaries") or {}).get("user_id") for r in star_rows} - {None})
    nick = _nicknames(author_ids)
    # 효과(상점에서 산 특수 행성)는 작성자별 조회라 작성자마다 불러 합친다.
    effects: dict[str, dict] = {}
    for a in author_ids:
        effects.update(applied_effects(a))
    # 행성 외형(AI 감정 분석)은 list_stars와 동일하게 서비스가 있을 때만 붙인다.
    contents = [(r.get("diaries") or {}).get("content") for r in star_rows]
    known = [i for i, c in enumerate(contents) if c]
    planet_by_index: dict[int, dict] = {}
    if known:
        visuals = ai_client.planet_visuals([contents[i] for i in known])
        if visuals:
            planet_by_index = {i: v for i, v in zip(known, visuals)}
    out = []
    for i, r in enumerate(star_rows):
        d = r.get("diaries") or {}
        eff = effects.get(str(r["diary_id"]))
        out.append(
            GroupStarEntry(
                diary_id=str(r["diary_id"]),
                content=d.get("content") or "",
                created_at=d.get("created_at"),
                nickname=nick.get(d.get("user_id")),
                x=r["x"],
                y=r["y"],
                z=r["z"],
                color=r["color"],
                size=r["size"],
                brightness=r["brightness"],
                planet=planet_by_index.get(i),
                effect=eff["effect"] if eff else None,
            )
        )
    return out


@router.delete("/{group_id}/members/me", status_code=204)
def leave_group(group_id: str, user_id: str = Depends(get_current_user_id)):
    """그룹 나가기: 내 멤버십만 제거. 아무도 안 남으면 그룹 자체를 삭제한다
    (diary_groups는 groups 삭제 시 on delete cascade 로 정리됨)."""
    mine = (
        supabase.table("group_members")
        .select("user_id")
        .eq("group_id", group_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not mine:
        # 멤버가 아니면 아무것도 정리하지 않는다(비멤버가 빈 그룹을 삭제하는 것 방지). 멱등.
        return Response(status_code=204)
    # 나가는 사람이 이 그룹에 공유(태그)한 일기도 함께 뺀다 — 탈퇴 후에도 남의 일기가 계속 보이지 않도록.
    my_tags = (
        supabase.table("diary_groups")
        .select("diary_id, diaries!inner(user_id)")
        .eq("group_id", group_id)
        .eq("diaries.user_id", user_id)
        .execute()
        .data
    )
    my_tag_ids = [t["diary_id"] for t in my_tags]
    if my_tag_ids:
        supabase.table("diary_groups").delete().eq("group_id", group_id).in_(
            "diary_id", my_tag_ids
        ).execute()
    supabase.table("group_members").delete().eq("group_id", group_id).eq(
        "user_id", user_id
    ).execute()
    remaining = (
        supabase.table("group_members").select("user_id").eq("group_id", group_id).execute().data
    )
    if not remaining:
        supabase.table("groups").delete().eq("id", group_id).execute()
    # shortcut: 태그 제거·멤버십 삭제·빈 그룹 삭제가 한 트랜잭션이 아니다. 마지막 멤버 탈퇴와 '동시에'
    #   다른 사용자가 가입하면 그 가입이 CASCADE로 지워질 수 있고, 중간 실패 시 일부만 반영될 수 있다
    #   (개인용 앱이라 사실상 발생 불가). 멀티유저 동시성이 커지면 이 단계들을 Postgres RPC(단일 트랜잭션)로 합칠 것.
    return Response(status_code=204)
