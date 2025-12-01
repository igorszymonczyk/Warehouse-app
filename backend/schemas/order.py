from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    qty: float
    unit_price: float
    line_total: float


class OrderCreatePayload(BaseModel):
    invoice_buyer_name: str
    invoice_buyer_nip: Optional[str] = None
    invoice_address_street: str
    invoice_address_zip: str
    invoice_address_city: str
    
    
    shipping_address_street: Optional[str] = None
    shipping_address_zip: Optional[str] = None
    shipping_address_city: Optional[str] = None

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
    status: str

class PaymentInitiationResponse(BaseModel):
    redirect_url: Optional[str]
    order_id: int