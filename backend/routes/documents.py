# backend/routes/documents.py
from typing import Optional, Literal, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from models.invoice import Invoice
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from schemas.documents import DocumentsPage, DocumentListItem

router = APIRouter(tags=["Documents"])

# Check if the user has appropriate permissions (Admin, Salesman, or Warehouse)
def _role_ok(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN", "WAREHOUSE"}

# Parse ISO datetime string with validation
def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Bad datetime format: {s}")


# Retrieve a list of documents with filtering, pagination, and sorting
@router.get("/documents", response_model=DocumentsPage)
def list_documents(
    type: Optional[Literal["invoice", "wz"]] = Query(None, description="Filtr rodzaju dokumentu"),
    buyer: Optional[str] = Query(None, description="Szukaj po nazwie klienta"),
    date_from: Optional[str] = Query(None, description="ISO datetime od"),
    date_to: Optional[str] = Query(None, description="ISO datetime do"),
    status: Optional[WarehouseStatus] = Query(None, description="Status (WZ: NEW/IN_PROGRESS/RELEASED/CANCELLED)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["date", "buyer", "status", "id"] = "date",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    # Enforce role-based access control
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    fdt = _parse_iso(date_from)
    tdt = _parse_iso(date_to)

    # --- INVOICE PROCESSING ---
    inv_items: List[Dict[str, Any]] = []
    inv_total = 0
    if type in (None, "invoice"):
        iq = db.query(Invoice)

        # Apply filters: buyer, date range, status
        if buyer and hasattr(Invoice, "buyer_name"):
            iq = iq.filter(Invoice.buyer_name.ilike(f"%{buyer}%"))
        if fdt and hasattr(Invoice, "created_at"):
            iq = iq.filter(Invoice.created_at >= fdt)
        if tdt and hasattr(Invoice, "created_at"):
            iq = iq.filter(Invoice.created_at <= tdt)
        if status and hasattr(Invoice, "status"):
            iq = iq.filter(Invoice.status == status)

        inv_total = iq.count()

        # Apply sorting logic
        if sort_by == "date" and hasattr(Invoice, "created_at"):
            iq = iq.order_by(Invoice.created_at.asc() if order == "asc" else Invoice.created_at.desc())
        elif sort_by == "buyer" and hasattr(Invoice, "buyer_name"):
            iq = iq.order_by(Invoice.buyer_name.asc() if order == "asc" else Invoice.buyer_name.desc())
        elif sort_by == "status" and hasattr(Invoice, "status"):
            iq = iq.order_by(Invoice.status.asc() if order == "asc" else Invoice.status.desc())
        else:
            iq = iq.order_by(Invoice.id.asc() if order == "asc" else Invoice.id.desc())

        # Fetch paginated results and map to dictionary
        inv_page = iq.offset((page - 1) * page_size).limit(page_size).all()
        for i in inv_page:
            inv_items.append({
                "type": "invoice",
                "id": i.id,
                "number": getattr(i, "number", f"INV-{i.id}"),
                "date": getattr(i, "created_at", None),
                "status": getattr(i, "status", None),
                "order_id": getattr(i, "order_id", None),
                "buyer": getattr(i, "buyer_name", None),
                "total_net": getattr(i, "total_net", None),
                "total_vat": getattr(i, "total_vat", None),
                "total_gross": getattr(i, "total_gross", None),
            })

    # --- WAREHOUSE DOCUMENT PROCESSING ---
    wz_items: List[Dict[str, Any]] = []
    wz_total = 0
    if type in (None, "wz"):
        wq = db.query(WarehouseDocument)

        # Apply filters for warehouse documents
        if buyer and hasattr(WarehouseDocument, "buyer_name"):
            wq = wq.filter(WarehouseDocument.buyer_name.ilike(f"%{buyer}%"))
        if fdt and hasattr(WarehouseDocument, "created_at"):
            wq = wq.filter(WarehouseDocument.created_at >= fdt)
        if tdt and hasattr(WarehouseDocument, "created_at"):
            wq = wq.filter(WarehouseDocument.created_at <= tdt)
        if status:
            wq = wq.filter(WarehouseDocument.status == status)

        wz_total = wq.count()

        # Apply sorting logic
        if sort_by == "date" and hasattr(WarehouseDocument, "created_at"):
            wq = wq.order_by(WarehouseDocument.created_at.asc() if order == "asc" else WarehouseDocument.created_at.desc())
        elif sort_by == "buyer" and hasattr(WarehouseDocument, "buyer_name"):
            wq = wq.order_by(WarehouseDocument.buyer_name.asc() if order == "asc" else WarehouseDocument.buyer_name.desc())
        elif sort_by == "status" and hasattr(WarehouseDocument, "status"):
            wq = wq.order_by(WarehouseDocument.status.asc() if order == "asc" else WarehouseDocument.status.desc())
        else:
            wq = wq.order_by(WarehouseDocument.id.asc() if order == "asc" else WarehouseDocument.id.desc())

        # Fetch paginated results and map to dictionary
        wz_page = wq.offset((page - 1) * page_size).limit(page_size).all()
        for w in wz_page:
            wz_items.append({
                "type": "wz",
                "id": w.id,
                "number": f"WZ-{w.id}",
                "date": getattr(w, "created_at", None),
                "status": getattr(w, "status", None),
                "order_id": getattr(w, "invoice_id", None),
                "buyer": getattr(w, "buyer_name", None),
                "items_json": getattr(w, "items_json", None),
            })

    # Combine results and construct final response
    items: List[DocumentListItem] = [DocumentListItem(**x) for x in (inv_items + wz_items)]
    total = (inv_total if type in (None, "invoice") else 0) + (wz_total if type in (None, "wz") else 0)

    return {"items": items, "total": total, "page": page, "page_size": page_size}