# backend/schemas/stock.py
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional, Literal

StockMovementType = Literal["IN", "OUT", "ADJUSTMENT", "LOSS"]

class StockMovementBase(BaseModel):
    product_id: int
    qty: int = Field(alias="quantity_change") 
    reason: Optional[str] = None
    type: StockMovementType
    supplier: Optional[str] = None # Nowe pole

class StockMovementCreate(StockMovementBase):
    pass

class StockMovementResponse(StockMovementBase):
    id: int
    created_at: datetime
    user_id: int
    product_name: str
    product_code: str
    user_email: str
    
    qty: int
    supplier: Optional[str] = None # Nowe pole w odpowiedzi

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class StockMovementPage(BaseModel):
    items: List[StockMovementResponse]
    total: int
    page: int
    page_size: int

class DeliveryItem(BaseModel):
    product_id: int
    quantity: int

class DeliveryCreate(BaseModel):
    items: List[DeliveryItem]
    reason: Optional[str] = "Dostawa towaru"
    supplier: Optional[str] = None # Dostawca dla całej dostawy