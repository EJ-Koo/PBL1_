from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

ItemKind = Literal["consumable", "equip"]


class Wallet(BaseModel):
    coins: int
    # 테스트용 '내 상점 초기화'를 쓸 수 있는지 (관리자 설정 allow_test_reset)
    reset_allowed: bool = False


class ShopItem(BaseModel):
    """상점 화면용 아이템 + 내가 가진 상태."""

    id: str
    name: str
    icon: str
    description: str
    price: int
    kind: ItemKind
    slot: str | None = None
    effect: dict[str, Any] = {}
    on_sale: bool  # 상점에서 팔고 있는지 (false 여도 이미 산 사람은 계속 사용)
    quantity: int = 0  # 보유 개수 (equip 은 0 또는 1)
    equipped: bool = False


class PurchaseRequest(BaseModel):
    item_id: str


class PurchaseResult(BaseModel):
    coins: int
    item_id: str
    quantity: int


class EquipRequest(BaseModel):
    equipped: bool


# --- 관리자 ---------------------------------------------------------------------


class AdminItem(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    price: int
    kind: ItemKind
    slot: str | None = None
    effect: dict[str, Any] = {}
    is_active: bool
    sort_order: int


class AdminItemCreate(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=40)
    icon: str = Field(default="⭐", min_length=1, max_length=8)
    description: str = Field(default="", max_length=200)
    price: int = Field(ge=0, le=100000)
    kind: ItemKind
    slot: str | None = Field(default=None, max_length=40)
    effect: dict[str, Any] = {}
    is_active: bool = True
    sort_order: int = 0

    @model_validator(mode="after")
    def _equip_needs_slot(self):
        if self.kind == "equip" and not self.slot:
            raise ValueError("장착 아이템(equip)은 slot이 필요합니다 (예: background)")
        return self


class AdminItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    icon: str | None = Field(default=None, min_length=1, max_length=8)
    description: str | None = Field(default=None, max_length=200)
    price: int | None = Field(default=None, ge=0, le=100000)
    slot: str | None = Field(default=None, max_length=40)
    effect: dict[str, Any] | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class AdminConfigEntry(BaseModel):
    key: str
    value: Any
    description: str
    kind: Literal["int", "bool"] = "int"  # 관리자 화면 입력 방식 (숫자칸 / 켜기·끄기)


class AdminConfigUpdate(BaseModel):
    value: Any


class AdminWallet(BaseModel):
    user_id: str
    email: str | None = None
    nickname: str | None = None
    coins: int | None = None  # 아직 앱을 열지 않아 지갑이 없으면 None


class AdminCoinAdjust(BaseModel):
    delta: int = Field(ge=-100000, le=100000)
    memo: str = Field(default="", max_length=100)


class CoinLog(BaseModel):
    delta: int
    balance: int
    reason: str
    ref: str | None = None
    created_at: str
