# routes/products.py
from typing import Optional, Literal, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
from schemas.products import ProductEditRequest, ProductOut, ProductListPage

router = APIRouter(prefix="/products", tags=["Products"])

def _can_edit(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN"}

def _is_logged(user: User) -> bool:
    return bool(user and user.id)

@router.get("", response_model=ProductListPage)
def list_products(
    q: Optional[str] = Query(None, description="Szukaj po nazwie lub kodzie"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    sort_by: Literal["name", "code", "sell_price_net", "stock_quantity", "id"] = "name",
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _is_logged(current_user)  # dowolny zalogowany może podejrzeć listę (do wyboru/edycji na froncie)

    qset = db.query(Product)

    if q:
        like = f"%{q}%"
        qset = qset.filter(
            (Product.name.ilike(like)) | (Product.code.ilike(like))
        )

    sort_map = {
        "id": Product.id,
        "name": Product.name,
        "code": Product.code,
        "sell_price_net": Product.sell_price_net,
        "stock_quantity": Product.stock_quantity,
    }
    col = sort_map[sort_by]
    qset = qset.order_by(col.asc() if order == "asc" else col.desc())

    total = qset.count()
    rows: List[Product] = qset.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [ProductOut.from_orm(p) for p in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }

@router.patch("/{product_id}/edit", response_model=ProductOut)
def edit_product(
    product_id: int,
    payload: ProductEditRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    p: Product = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    # Walidacje biznesowe (dodatkowe poza Pydantic)
    if payload.sell_price_net is not None and payload.sell_price_net <= 0:
        raise HTTPException(status_code=400, detail="Price must be > 0")
    if payload.tax_rate is not None and payload.tax_rate < 0:
        raise HTTPException(status_code=400, detail="Tax rate must be >= 0")
    if payload.stock_quantity is not None and payload.stock_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock must be >= 0")

    # Aktualizacja tylko podanych pól
    if payload.name is not None:
        p.name = payload.name
    if payload.code is not None:
        p.code = payload.code
    if payload.sell_price_net is not None:
        p.sell_price_net = payload.sell_price_net
    if payload.tax_rate is not None:
        p.tax_rate = payload.tax_rate
    if payload.stock_quantity is not None:
        p.stock_quantity = payload.stock_quantity

    db.commit()
    db.refresh(p)

    # Audit
    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_EDIT",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "product_id": p.id,
            "name": p.name,
            "code": p.code,
            "sell_price_net": p.sell_price_net,
            "tax_rate": p.tax_rate,
            "stock_quantity": p.stock_quantity,
        },
    )

    return ProductOut.from_orm(p)
