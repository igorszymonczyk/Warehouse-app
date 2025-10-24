# schemas/products.py
from typing import Optional, List
from pydantic import BaseModel, Field

class ProductEditRequest(BaseModel):
    name: Optional[str] = Field(None, description="Nazwa produktu")
    code: Optional[str] = Field(None, description="Kod produktu")
    sell_price_net: Optional[float] = Field(None, gt=0, description="Cena netto > 0")
    tax_rate: Optional[float] = Field(None, ge=0, description="Stawka VAT >= 0")
    stock_quantity: Optional[float] = Field(None, ge=0, description="Stan magazynowy >= 0")

class ProductOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    sell_price_net: float
    tax_rate: float
    stock_quantity: Optional[float] = None

    class Config:
        from_attributes = True

class ProductListPage(BaseModel):
    items: List[ProductOut]
    total: int
    page: int
    page_size: int
