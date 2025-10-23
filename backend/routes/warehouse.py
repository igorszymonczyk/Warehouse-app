# routes/warehouse.py
from typing import Optional, Literal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session

from database import get_db
from models.users import User
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from utils.tokenJWT import get_current_user
from utils.audit import write_log

# jeśli masz Page/Item w schemas.warehouse – odkomentuj i ustaw response_model
from schemas.warehouse import WarehouseStatusUpdate, WarehouseDocPage

router = APIRouter(prefix="/warehouse-documents", tags=["Warehouse"])

def _role_ok(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "WAREHOUSE"}

# -----------------------------
# Lista zgłoszeń magazynowych (z filtrami, paginacją i sortowaniem)
# -----------------------------
@router.get("/", response_model=WarehouseDocPage)
def list_warehouse_documents(
    status: Optional[WarehouseStatus] = Query(None, description="Filtruj po statusie"),
    buyer: Optional[str] = Query(None, description="Szukaj po nazwie klienta"),
    from_dt: Optional[str] = Query(None, description="ISO datetime, np. 2025-10-23T00:00:00"),
    to_dt: Optional[str]   = Query(None, description="ISO datetime"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "status", "buyer_name"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view warehouse documents")

    q = db.query(WarehouseDocument)

    if status:
        q = q.filter(WarehouseDocument.status == status)

    if buyer:
        like = f"%{buyer}%"
        q = q.filter(WarehouseDocument.buyer_name.ilike(like))

    def _parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Bad datetime format: {s}")

    fdt = _parse_iso(from_dt)
    tdt = _parse_iso(to_dt)
    if fdt:
        q = q.filter(WarehouseDocument.created_at >= fdt)
    if tdt:
        q = q.filter(WarehouseDocument.created_at <= tdt)

    sort_map = {
        "created_at": WarehouseDocument.created_at,
        "status": WarehouseDocument.status,
        "buyer_name": WarehouseDocument.buyer_name,
    }
    col = sort_map[sort_by]
    q = q.order_by(col.asc() if order == "asc" else col.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total, "page": page, "page_size": page_size}

# -----------------------------
# Zmiana statusu zgłoszenia (BEZ ZMIAN)
# -----------------------------
@router.patch("/{doc_id}/status")
def update_warehouse_status(
    doc_id: int,
    status_data: WarehouseStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to change status")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    old_status = doc.status
    new_status = status_data.status

    allowed_transitions = {
        WarehouseStatus.NEW: [WarehouseStatus.IN_PROGRESS, WarehouseStatus.CANCELLED],
        WarehouseStatus.IN_PROGRESS: [WarehouseStatus.RELEASED, WarehouseStatus.CANCELLED],
        WarehouseStatus.RELEASED: [],
        WarehouseStatus.CANCELLED: [],
    }

    if new_status not in allowed_transitions[old_status]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change status from {old_status} to {new_status}",
        )

    doc.status = new_status
    db.commit()
    db.refresh(doc)

    write_log(
        db,
        user_id=current_user.id,
        action="WAREHOUSE_STATUS_UPDATE",
        resource="warehouse_documents",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"doc_id": doc.id, "old_status": old_status, "new_status": new_status},
    )

    return {"message": f"Status changed from {old_status} → {new_status}"}
