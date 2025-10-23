# schemas/documents.py
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel

class DocumentListItem(BaseModel):
    type: Literal["invoice", "wz"]
    id: int
    number: Optional[str] = None
    date: Optional[datetime] = None
    status: Optional[str] = None
    order_id: Optional[int] = None
    buyer: Optional[str] = None

    # tylko dla faktur (jeśli dostępne w modelu)
    total_net: Optional[float] = None
    total_vat: Optional[float] = None
    total_gross: Optional[float] = None

    # tylko dla WZ (Twoje pole items_json)
    items_json: Optional[str] = None

class DocumentsPage(BaseModel):
    items: List[DocumentListItem]
    total: int
    page: int
    page_size: int
