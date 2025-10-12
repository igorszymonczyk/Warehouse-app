from pydantic import BaseModel, Field
from typing import List

class CartAddItem(BaseModel):
    product_id: int
    qty: float = Field(gt=0)

class CartUpdateItem(BaseModel):
    qty: float = Field(gt=0)

class CartItemOut(BaseModel):
    id: int
    product_id: int
    name: str
    qty: float
    unit_price: float
    line_total: float

    class Config:
        from_attributes = True

class CartOut(BaseModel):
    items: List[CartItemOut]
    total: float
