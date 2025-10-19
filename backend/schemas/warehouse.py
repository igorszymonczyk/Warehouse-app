from pydantic import BaseModel
from enum import Enum

class WarehouseStatus(str, Enum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    RELEASED = "RELEASED"
    CANCELLED = "CANCELLED"

class WarehouseStatusUpdate(BaseModel):
    status: WarehouseStatus
