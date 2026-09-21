from pydantic import BaseModel


class Star(BaseModel):
    id: str
    diary_id: str
    x: float
    y: float
    z: float
    color: str
    size: float
    brightness: float
