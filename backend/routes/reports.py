# routes/reports.py
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from models.product import Product
from models.order import Order
from schemas.reports import (
    LowStockPage, LowStockItem,
    SalesSummaryResponse, SalesSummaryItem
)

router = APIRouter(prefix="/reports", tags=["Reports"])

def _role_ok(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN", "WAREHOUSE"}

# -----------------------------
# 1) Niskie stany
# -----------------------------
@router.get("/low-stock", response_model=LowStockPage)
def report_low_stock(
    threshold: float = Query(10, ge=0, description="Próg stanu (<=)"),
    q: Optional[str] = Query(None, description="Szukaj po nazwie/kodzie"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    query = db.query(Product).filter(Product.stock_quantity <= threshold)
    if q:
        like = f"%{q}%"
        query = query.filter((Product.name.ilike(like)) | (Product.code.ilike(like)))

    total = query.count()
    rows = (query
            .order_by(Product.stock_quantity.asc(), Product.name.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all())

    items: List[LowStockItem] = [
        LowStockItem(
            product_id=p.id,
            name=p.name,
            code=p.code,
            stock_quantity=p.stock_quantity or 0
        )
        for p in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}

# -----------------------------
# 2) Podsumowanie sprzedaży (Orders)
# -----------------------------
def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Bad datetime format: {s}")

@router.get("/sales-summary", response_model=SalesSummaryResponse)
def report_sales_summary(
    date_from: Optional[str] = Query(None, description="ISO datetime od"),
    date_to: Optional[str] = Query(None, description="ISO datetime do"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    fdt = _parse_iso(date_from)
    tdt = _parse_iso(date_to)

    q = db.query(
        cast(Order.created_at, Date).label("d"),
        func.count(Order.id).label("orders"),
        func.coalesce(func.sum(Order.total_amount), 0.0).label("total_amount"),
    )

    if fdt:
        q = q.filter(Order.created_at >= fdt)
    if tdt:
        q = q.filter(Order.created_at <= tdt)

    q = q.group_by(cast(Order.created_at, Date)).order_by(cast(Order.created_at, Date).asc())

    rows = q.all()

    items: List[SalesSummaryItem] = [
        SalesSummaryItem(date=r.d, orders=r.orders, total_amount=float(r.total_amount))
        for r in rows
    ]
    total_orders = sum(i.orders for i in items)
    total_amount = round(sum(i.total_amount for i in items), 2)

    return SalesSummaryResponse(
        items=items,
        total_orders=total_orders,
        total_amount=total_amount,
        date_from=fdt,
        date_to=tdt,
    )
