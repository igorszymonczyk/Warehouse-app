from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing import Optional
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from schemas.warehouse import WarehouseStatusUpdate
from database import get_db
from models.users import User
from utils.tokenJWT import get_current_user
from utils.audit import write_log

router = APIRouter(prefix="/warehouse-documents", tags=["Warehouse"])

# -----------------------------
# Lista zgłoszeń magazynowych
# -----------------------------
@router.get("/")
def list_warehouse_documents(
    status: Optional[WarehouseStatus] = Query(None, description="Filtruj po statusie"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # autoryzacja: tylko magazynier lub admin
    if (current_user.role or "").upper() not in {"ADMIN", "WAREHOUSE"}:
        raise HTTPException(status_code=403, detail="Not authorized to view warehouse documents")

    query = db.query(WarehouseDocument)
    if status:
        query = query.filter(WarehouseDocument.status == status)

    docs = query.order_by(WarehouseDocument.created_at.desc()).all()
    return docs

# -----------------------------
# Zmiana statusu zgłoszenia
# -----------------------------
@router.patch("/{doc_id}/status")
def update_warehouse_status(
    doc_id: int,
    status_data: WarehouseStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # autoryzacja: tylko magazynier lub admin
    if (current_user.role or "").upper() not in {"ADMIN", "WAREHOUSE"}:
        raise HTTPException(status_code=403, detail="Not authorized to change status")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    old_status = doc.status
    new_status = status_data.status

    # ograniczenia zmian statusów
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

    # zapis audytu
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
