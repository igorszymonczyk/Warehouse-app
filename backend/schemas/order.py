from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class OrderItemOut(BaseModel):
    product_id: int
    qty: float
    unit_price: float
    line_total: float

class OrderResponse(BaseModel):
    id: int
    status: str
    total_amount: float
    created_at: datetime
    items: List[OrderItemOut]

    class Config:
        from_attributes = True

class OrdersPage(BaseModel):
    items: List[OrderResponse]
    total: int
    page: int
    page_size: int

class OrderStatusPatch(BaseModel):
    # dopuszczamy również 'cancelled'
    status: str = Field(pattern="^(pending|processing|shipped|cancelled)$")
