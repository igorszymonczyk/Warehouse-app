# schemas/warehouse.py
from pydantic import BaseModel
from typing import List
from datetime import datetime
from models.WarehouseDoc import WarehouseStatus  # Enum z modelu

class WarehouseStatusUpdate(BaseModel):
    status: WarehouseStatus

class WarehouseDocItem(BaseModel):
    id: int
    invoice_id: int
    buyer_name: str
    items_json: str
    status: WarehouseStatus
    created_at: datetime

    class Config:
        from_attributes = True

class WarehouseDocPage(BaseModel):
    items: List[WarehouseDocItem]
    total: int
    page: int
    page_size: int
