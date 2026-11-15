from pydantic import BaseModel, Field, field_validator


class ProfileCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=24)

    @field_validator('nickname', mode='before')
    @classmethod
    def trim_nickname(cls, value):
        return value.strip() if isinstance(value, str) else value


class ProfileUpdate(ProfileCreate):
    bio: str = Field(default='', max_length=80)
    avatar_path: str | None = Field(default=None, max_length=200)

    @field_validator('bio', mode='before')
    @classmethod
    def trim_bio(cls, value):
        if isinstance(value, str):
            if '\n' in value or '\r' in value:
                raise ValueError('한 줄 소개에는 줄바꿈을 넣을 수 없습니다.')
            return value.strip()
        return value


class Profile(BaseModel):
    id: str
    user_id: str
    nickname: str
    created_at: str
    bio: str = ''
    avatar_path: str | None = None
    avatar_url: str | None = None
