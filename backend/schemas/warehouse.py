# backend/schemas/warehouse.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from models.WarehouseDoc import WarehouseStatus  # Enum z modelu

# 1. ZMIANA: Schema dla pojedynczego produktu (sparsowany z JSON)
class WzProductItem(BaseModel):
    product_name: str
    product_code: str
    quantity: float = Field(alias='qty') # Mapowanie z 'qty' na 'quantity'
    location: Optional[str] = None

# 2. ZMIANA: Schema dla pełnych szczegółów WZ
class WarehouseDocDetail(BaseModel):
    id: int
    invoice_id: Optional[int] = None
    buyer_name: str
    status: WarehouseStatus
    created_at: datetime
    # Lista sparsowanych produktów
    items: List[WzProductItem] 

    class Config:
        from_attributes = True
        populate_by_name = True 

# 3. ZMIANA: Istniejące schematy (zachowane)
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