# backend/schemas/warehouse.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from models.WarehouseDoc import WarehouseStatus

class WzProductItem(BaseModel):
    product_name: str
    product_code: str
    quantity: float
    location: Optional[str] = None

class WarehouseDocDetail(BaseModel):
    id: int
    invoice_id: Optional[int] = None
    buyer_name: str
    shipping_address: Optional[str] = None
    status: WarehouseStatus
    created_at: datetime
    items: List[WzProductItem] 

    class Config:
        from_attributes = True
        populate_by_name = True 

class WarehouseDocItem(BaseModel):
    id: int
    buyer_name: str
    status: WarehouseStatus
    created_at: datetime

    class Config:
        from_attributes = True

class WarehouseStatusUpdate(BaseModel):
    status: WarehouseStatus

class WarehouseDocPage(BaseModel):
    items: List[WarehouseDocItem]
    total: int
    page: int
    page_size: int