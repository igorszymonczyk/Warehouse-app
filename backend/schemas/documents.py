# schemas/documents.py
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel

# Unified representation of a document (Invoice or WZ) for list views
class DocumentListItem(BaseModel):
    type: Literal["invoice", "wz"]
    id: int
    number: Optional[str] = None
    date: Optional[datetime] = None
    status: Optional[str] = None
    order_id: Optional[int] = None
    buyer: Optional[str] = None

    # Fields specific to Invoice documents
    total_net: Optional[float] = None
    total_vat: Optional[float] = None
    total_gross: Optional[float] = None

    # Fields specific to Warehouse Documents (WZ)
    items_json: Optional[str] = None

# Response schema for paginated document lists
class DocumentsPage(BaseModel):
    items: List[DocumentListItem]
    total: int
    page: int
    page_size: int