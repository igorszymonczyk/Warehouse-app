# backend/schemas/stock.py
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional, Literal

# Define allowed types for stock movements
StockMovementType = Literal["IN", "OUT", "ADJUSTMENT", "LOSS"]

# Base schema for stock movement data
class StockMovementBase(BaseModel):
    product_id: int
    qty: int = Field(alias="quantity_change") 
    reason: Optional[str] = None
    type: StockMovementType
    supplier: Optional[str] = None # Optional supplier reference

# Schema for creating a new stock movement
class StockMovementCreate(StockMovementBase):
    pass

# Schema for returning stock movement details
class StockMovementResponse(StockMovementBase):
    id: int
    created_at: datetime
    user_id: int
    product_name: str
    product_code: str
    user_email: str
    
    qty: int
    supplier: Optional[str] = None # Included in response

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# Paginated response for stock movement history
class StockMovementPage(BaseModel):
    items: List[StockMovementResponse]
    total: int
    page: int
    page_size: int

# Schema for a single item within a bulk delivery
class DeliveryItem(BaseModel):
    product_id: int
    quantity: int

# Schema for registering a bulk stock delivery
class DeliveryCreate(BaseModel):
    items: List[DeliveryItem]
    reason: Optional[str] = "Dostawa towaru"
    supplier: Optional[str] = None # Supplier for the entire delivery