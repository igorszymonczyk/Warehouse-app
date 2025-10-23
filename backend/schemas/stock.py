# schemas/stock.py
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

# ----- INPUTS -----

class StockReceiptIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0, description="Ilość > 0")
    note: Optional[str] = None


class StockAdjustIn(BaseModel):
    product_id: int
    qty_delta: float = Field(description="Może być dodatnie lub ujemne; 0 niedozwolone")
    reason: Optional[str] = None

    # walidacja prosta: 0 zabronione (możesz też zrobić @model_validator)
    def model_post_init(self, _ctx) -> None:
        if self.qty_delta == 0:
            raise ValueError("qty_delta cannot be 0")


# ----- OUTPUTS -----

class StockMovementOut(BaseModel):
    id: int
    product_id: int
    type: str            # "in" | "adjust"
    qty: float
    doc_type: Optional[str] = None
    doc_id: Optional[int] = None
    user_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StockMovementsPage(BaseModel):
    items: List[StockMovementOut]
    total: int
    page: int
    page_size: int


class StockLevelOut(BaseModel):
    product_id: int
    name: str
    stock_quantity: float
