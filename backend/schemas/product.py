from pydantic import BaseModel
from typing import Optional

class ProductBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    buy_price: float
    sell_price_net: float
    tax_rate: float
    stock_quantity: float
    location: Optional[str] = None
    comment: Optional[str] = None

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: int

    class Config:
        from_attributes = True  