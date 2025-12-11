# schemas/invoice.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Input schema for a single line item in an invoice
class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    price_net: Optional[float] = None
    tax_rate: Optional[float] = None

# Input schema for creating a new invoice
class InvoiceCreate(BaseModel):
    buyer_name: str
    buyer_nip: Optional[str] = None
    buyer_address: Optional[str] = None
    items: List[InvoiceItemCreate]

# Output schema for an invoice line item
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

# Output schema for the invoice summary
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

# Detailed output schema for an invoice line item
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

# Comprehensive output schema for a single invoice (includes corrections)
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
    shipping_address: Optional[str] = None

    class Config:
        from_attributes = True

# Schema for summary representation in lists
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

# Paginated response wrapper for invoice lists
class InvoiceListPage(BaseModel):
    items: List[InvoiceListItem]
    total: int
    page: int
    page_size: int

# Input schema for creating a correction invoice
class InvoiceCorrectionCreate(BaseModel):
    buyer_name: str
    buyer_nip: Optional[str] = None
    buyer_address: Optional[str] = None
    items: List[InvoiceItemCreate]
    correction_reason: str