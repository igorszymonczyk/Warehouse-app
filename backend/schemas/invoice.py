# schemas/invoice.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    price_net: float  # aktualna cena netto (można zmienić jednorazowo)
    tax_rate: float   # stawka VAT w %

class InvoiceCreate(BaseModel):
    buyer_name: str
    buyer_nip: Optional[str] = None
    buyer_address: Optional[str] = None
    items: List[InvoiceItemCreate]

class InvoiceItemResponse(InvoiceItemCreate):
    total_net: float
    total_gross: float

class InvoiceResponse(BaseModel):
    id: int
    buyer_name: str
    buyer_nip: Optional[str]
    buyer_address: Optional[str]
    total_net: float
    total_vat: float
    total_gross: float
    items: List[InvoiceItemResponse]

    class Config:
        from_attributes = True

class InvoiceItemDetail(BaseModel):
    product_id: int
    product_name: Optional[str]
    quantity: int
    price_net: float
    tax_rate: float
    total_net: float
    total_gross: float

    class Config:
        from_attributes = True

class InvoiceDetail(BaseModel):
    id: int
    buyer_name: str
    buyer_nip: Optional[str]
    buyer_address: Optional[str]
    created_at: datetime
    total_net: float
    total_vat: float
    total_gross: float
    items: List[InvoiceItemDetail]

    class Config:
        from_attributes = True

class InvoiceListItem(BaseModel):
    id: int
    buyer_name: str
    buyer_nip: Optional[str]
    created_at: datetime
    total_net: float
    total_vat: float
    total_gross: float

    class Config:
        from_attributes = True

class InvoiceListPage(BaseModel):
    items: List[InvoiceListItem]
    total: int
    page: int
    page_size: int
