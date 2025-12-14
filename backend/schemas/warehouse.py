# backend/schemas/warehouse.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from models.WarehouseDoc import WarehouseStatus

# Represents a single product line within a warehouse document
class WzProductItem(BaseModel):
    product_name: str
    product_code: str
    quantity: float
    location: Optional[str] = None

# Detailed response schema for a warehouse document
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

# Summary schema for warehouse documents in list views
class WarehouseDocItem(BaseModel):
    id: int
    buyer_name: str
    status: WarehouseStatus
    created_at: datetime

    class Config:
        from_attributes = True

# Schema for updating warehouse document status
class WarehouseStatusUpdate(BaseModel):
    status: WarehouseStatus

# Paginated response schema for warehouse documents
class WarehouseDocPage(BaseModel):
    items: List[WarehouseDocItem]
    total: int
    page: int
    page_size: int