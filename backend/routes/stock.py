# routes/stock.py
from typing import Optional, List
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
from models.stock import StockMovement  # model ruchów magazynowych
from schemas.stock import (
    StockReceiptIn,
    StockAdjustIn,
    StockMovementOut,
    StockMovementsPage,
    StockLevelOut,
)

router = APIRouter(prefix="/stock", tags=["Stock"])


# --- helpers ---------------------------------------------------------------

def _role_ok(user: User) -> bool:
    # ADMIN/WAREHOUSE robią ruchy; SALESMAN podgląda
    role = (user.role or "").upper()
    return role in {"ADMIN", "WAREHOUSE", "SALESMAN"}


def _can_modify_stock(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "WAREHOUSE"}


def _env_bool(name: str, default: bool = False) -> bool:
    """Parse bool from env like: 'true/1/yes' -> True."""
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _allow_negative_stock() -> bool:
    # Główny przełącznik polityki
    return _env_bool("ALLOW_NEGATIVE_STOCK", default=False)


# --- endpoints -------------------------------------------------------------

# PRZYJĘCIE (IN)
@router.post("/receipt", response_model=StockMovementOut, status_code=status.HTTP_200_OK)
def stock_receipt(
    payload: StockReceiptIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_modify_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    before = float(product.stock_quantity or 0.0)
    after = before + float(payload.qty)
    product.stock_quantity = after

    move = StockMovement(
        product_id=product.id,
        type="in",
        qty=float(payload.qty),
        doc_type="manual",
        doc_id=None,
        user_id=current_user.id,
        note=payload.note or "",
    )

    db.add(move)
    db.commit()
    db.refresh(move)

    write_log(
        db,
        user_id=current_user.id,
        action="STOCK_RECEIPT",
        resource="stock",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "movement_id": move.id,
            "product_id": product.id,
            "qty": payload.qty,
            "before": before,
            "after": after,
            "note": payload.note,
            "allow_negative_stock": _allow_negative_stock(),
        },
    )
    return move


# KOREKTA (ADJUST +/- DELTA)
@router.post("/adjust", response_model=StockMovementOut, status_code=status.HTTP_200_OK)
def stock_adjust(
    payload: StockAdjustIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_modify_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.qty_delta == 0:
        raise HTTPException(status_code=400, detail="qty_delta cannot be 0")

    before = float(product.stock_quantity or 0.0)
    after = before + float(payload.qty_delta)

    # Polityka: blokuj zejście < 0, chyba że ALLOW_NEGATIVE_STOCK=true
    if after < 0 and not _allow_negative_stock():
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment would make stock negative (before={before}, delta={payload.qty_delta})",
        )

    product.stock_quantity = after

    move = StockMovement(
        product_id=product.id,
        type="adjust",
        qty=abs(float(payload.qty_delta)),
        doc_type="manual",
        doc_id=None,
        user_id=current_user.id,
        note=f"ADJUST: {payload.reason or ''} (delta={payload.qty_delta})",
    )

    db.add(move)
    db.commit()
    db.refresh(move)

    write_log(
        db,
        user_id=current_user.id,
        action="STOCK_ADJUST",
        resource="stock",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "movement_id": move.id,
            "product_id": product.id,
            "delta": payload.qty_delta,
            "before": before,
            "after": after,
            "reason": payload.reason,
            "allow_negative_stock": _allow_negative_stock(),
        },
    )
    return move


# LISTA RUCHÓW (PAGINACJA)
@router.get("/movements", response_model=StockMovementsPage)
def list_movements(
    product_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    q = db.query(StockMovement)
    if product_id:
        q = q.filter(StockMovement.product_id == product_id)

    total = q.count()
    rows: List[StockMovement] = (
        q.order_by(StockMovement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    write_log(
        db,
        user_id=current_user.id,
        action="STOCK_MOVEMENTS_LIST",
        resource="stock",
        status="SUCCESS",
        ip=None,
        meta={"product_id": product_id, "page": page, "page_size": page_size, "returned": len(rows)},
    )

    return {"items": rows, "total": total, "page": page, "page_size": page_size}


# POZIOMY STANÓW
@router.get("/levels", response_model=List[StockLevelOut])
def stock_levels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    products = db.query(Product).all()
    result = [
        StockLevelOut(
            product_id=p.id,
            name=p.name,
            stock_quantity=float(p.stock_quantity or 0.0),
        )
        for p in products
    ]

    write_log(
        db,
        user_id=current_user.id,
        action="STOCK_LEVELS_GET",
        resource="stock",
        status="SUCCESS",
        ip=None,
        meta={"count": len(result)},
    )
    return result
