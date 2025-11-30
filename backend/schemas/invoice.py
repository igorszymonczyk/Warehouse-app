# schemas/invoice.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    price_net: Optional[float] = None
    tax_rate: Optional[float] = None

class InvoiceCreate(BaseModel):
    buyer_name: str
    buyer_nip: Optional[str] = None
    buyer_address: Optional[str] = None
    items: List[InvoiceItemCreate]

class InvoiceItemResponse(BaseModel):
    product_id: int
    product_name: str # Added this
    quantity: int
    price_net: float
    tax_rate: float
    total_net: float
    total_gross: float

    class Config:
        from_attributes = True

class InvoiceResponse(BaseModel):
    id: int
    full_number: str
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
    product_name: str
    quantity: int
    price_net: float
    tax_rate: float
    total_net: float
    total_gross: float

    class Config:
        from_attributes = True

class InvoiceDetail(BaseModel):
    id: int
    full_number: str
    buyer_name: str
    buyer_nip: Optional[str]
    buyer_address: Optional[str]
    created_at: datetime
    total_net: float
    total_vat: float
    total_gross: float
    items: List[InvoiceItemDetail]
    is_correction: bool = False
    parent_id: Optional[int] = None
    correction_reason: Optional[str] = None

    class Config:
        from_attributes = True

class InvoiceListItem(BaseModel):
    id: int
    full_number: str
    buyer_name: str
    buyer_nip: Optional[str]
    created_at: datetime
    total_net: float
    total_vat: float
    total_gross: float
    payment_status: Optional[str] = None
    is_correction: bool = False
    parent_id: Optional[int] = None
    correction_reason: Optional[str] = None

    class Config:
        from_attributes = True

class InvoiceListPage(BaseModel):
    items: List[InvoiceListItem]
    total: int
    page: int
    page_size: int

class InvoiceCorrectionCreate(BaseModel):
    buyer_name: str
    buyer_nip: Optional[str] = None
    buyer_address: Optional[str] = None
    items: List[InvoiceItemCreate]
    correction_reason: str