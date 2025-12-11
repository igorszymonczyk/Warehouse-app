from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


# Output schema for an individual order line item
class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    qty: float
    unit_price: float
    line_total: float


# Input schema for creating a new order containing address details
class OrderCreatePayload(BaseModel):
    invoice_buyer_name: str
    invoice_buyer_nip: Optional[str] = None
    invoice_address_street: str
    invoice_address_zip: str
    invoice_address_city: str
    
    
    shipping_address_street: Optional[str] = None
    shipping_address_zip: Optional[str] = None
    shipping_address_city: Optional[str] = None

# Output schema representing the full order details
class OrderResponse(BaseModel):
    id: int
    status: str
    total_amount: float
    created_at: datetime
    items: List[OrderItemOut]
    class Config:
        from_attributes = True

# Schema for paginated order lists
class OrdersPage(BaseModel):
    items: List[OrderResponse]
    total: int
    page: int
    page_size: int

# Schema for updating order status
class OrderStatusPatch(BaseModel):
    status: str

# Response schema for payment initiation result
class PaymentInitiationResponse(BaseModel):
    redirect_url: Optional[str]
    order_id: int