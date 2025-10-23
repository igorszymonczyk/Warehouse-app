# schemas/reports.py
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel

# --- Low stock ---

class LowStockItem(BaseModel):
    product_id: int
    name: str
    code: Optional[str] = None
    stock_quantity: float

class LowStockPage(BaseModel):
    items: List[LowStockItem]
    total: int
    page: int
    page_size: int

# --- Sales summary ---

class SalesSummaryItem(BaseModel):
    date: date
    orders: int
    total_amount: float

class SalesSummaryResponse(BaseModel):
    items: List[SalesSummaryItem]
    total_orders: int
    total_amount: float
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
