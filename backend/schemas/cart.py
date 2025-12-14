from pydantic import BaseModel, Field
from typing import List

# Request schema for adding an item to the cart
class CartAddItem(BaseModel):
    product_id: int
    qty: float = Field(gt=0)

# Request schema for updating cart item quantity
class CartUpdateItem(BaseModel):
    qty: float = Field(gt=0)

# Response schema for a single cart line item
class CartItemOut(BaseModel):
    id: int
    product_id: int
    name: str
    qty: float
    unit_price: float
    line_total: float

    class Config:
        from_attributes = True

# Response schema for the entire cart summary
class CartOut(BaseModel):
    items: List[CartItemOut]
    total: float