# backend/schemas/order.py
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime



class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    qty: float
    unit_price: float
    line_total: float

    class Config:
        from_attributes = True

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

class OrderCreatePayload(BaseModel):
    invoice_buyer_name: str     # Nazwa firmy
    invoice_contact_person: str # Imię i nazwisko
    invoice_buyer_nip: Optional[str] = None
    invoice_address_street: str # Ulica + Numer
    invoice_address_zip: str    # Kod pocztowy
    invoice_address_city: str   # Miasto

class PaymentInitiationResponse(BaseModel):
    redirect_url: str
    order_id: int