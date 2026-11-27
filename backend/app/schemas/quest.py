from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class DailyQuestStatus(BaseModel):
    quest_id: Literal['daily_diary']
    day: date
    cycle: int = Field(ge=0)
    completed: bool
    progress: Literal[0, 1]
    target: Literal[1]
    reward: Literal[5]
    awarded: Literal[0, 5]
    coins: int = Field(ge=0)
    reset_allowed: bool
    after_reset: bool
    next_reset_at: datetime


class MeteorQuestHit(BaseModel):
    day: date
    meteor: Literal[1, 2, 3]


class MeteorQuestStatus(BaseModel):
    day: date
    cleared: list[Literal[1, 2, 3]]
    awarded: Literal[0, 3]
