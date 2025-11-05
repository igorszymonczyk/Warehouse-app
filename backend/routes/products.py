# routes/salesman.py
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
import schemas.product as product_schemas

router = APIRouter(tags=["Products"])


# ---- helpers ----
def _role_ok(user: User) -> bool:
    """Zezwól na dostęp dla ADMIN/SALESMAN (bez względu na wielkość liter)."""
    role = (user.role or "").upper()
    return role in {"ADMIN", "SALESMAN"}


def _can_edit(user: User) -> bool:
    """Zezwól na edycję dla ADMIN/SALESMAN."""
    return _role_ok(user)


# =========================
# LISTA PRODUKTÓW
# =========================
@router.get("/products", response_model=product_schemas.ProductListPage)
def list_products(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po nazwie, kodzie, opisie, kategorii lub dostawcy"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
    sort_by: str = Query(
        "id",
        description="Pole sortowania: id, code, name, sell_price_net, stock_quantity, created_at"
    ),
    order: str = Query("asc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    query = db.query(Product)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Product.name.ilike(like),
                Product.code.ilike(like),
                Product.description.ilike(like),
                Product.category.ilike(like),
                Product.supplier.ilike(like),
            )
        )

    allowed = {
        "id": Product.id,
        "code": Product.code,
        "name": Product.name,
        "sell_price_net": Product.sell_price_net,
        "stock_quantity": Product.stock_quantity,
        "created_at": getattr(Product, "created_at", Product.id),
    }

    sort_key = sort_by.lower()
    sort_col = allowed.get(sort_key, Product.id)
    query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    total = query.count()
    items: List[Product] = query.offset((page - 1) * page_size).limit(page_size).all()

    product_fields = list(product_schemas.ProductResponse.model_fields.keys())
    serialized = []
    for p in items:
        data = {f: getattr(p, f) for f in product_fields if hasattr(p, f)}
        serialized.append(product_schemas.ProductResponse.model_validate(data))

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCTS_LIST",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "q": q,
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "order": order,
            "returned": len(items),
        },
    )

    return {"items": serialized, "total": total, "page": page, "page_size": page_size}


# =========================
# POJEDYNCZY PRODUKT
# =========================
@router.get("/products/{product_id}", response_model=product_schemas.ProductResponse)
def get_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        write_log(
            db,
            user_id=current_user.id,
            action="PRODUCT_GET",
            resource="products",
            status="FAIL",
            ip=request.client.host if request.client else None,
            meta={"product_id": product_id, "reason": "not_found"},
        )
        raise HTTPException(status_code=404, detail="Product not found")

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_GET",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": product_id},
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(product, f) for f in fields if hasattr(product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# DODAWANIE PRODUKTU
# =========================
@router.post("/products", response_model=product_schemas.ProductResponse)
def add_product(
    product: product_schemas.ProductCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to add products")

    exists = db.query(Product).filter(Product.code == product.code).first()
    if exists:
        write_log(
            db,
            user_id=current_user.id,
            action="PRODUCT_CREATE",
            resource="products",
            status="FAIL",
            ip=request.client.host if request.client else None,
            meta={"code": product.code, "reason": "code_exists"},
        )
        raise HTTPException(status_code=400, detail="Product code already exists")

    new_product = Product(**product.model_dump())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_CREATE",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": new_product.id, "code": new_product.code},
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(new_product, f) for f in fields if hasattr(new_product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# AKTUALIZACJA PRODUKTU
# =========================
@router.put("/products/{product_id}", response_model=product_schemas.ProductResponse)
def update_product(
    product_id: int,
    updated_data: product_schemas.ProductCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to edit products")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        write_log(
            db,
            user_id=current_user.id,
            action="PRODUCT_UPDATE",
            resource="products",
            status="FAIL",
            ip=request.client.host if request.client else None,
            meta={"product_id": product_id, "reason": "not_found"},
        )
        raise HTTPException(status_code=404, detail="Product not found")

    before = {k: getattr(product, k) for k in updated_data.model_fields.keys()}
    for key, value in updated_data.model_dump().items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_UPDATE",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": product.id, "changed": {k: (before[k], getattr(product, k)) for k in before}},
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(product, f) for f in fields if hasattr(product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# CZĘŚCIOWA EDYCJA PRODUKTU (PATCH)
# =========================
@router.patch("/products/{product_id}/edit", response_model=product_schemas.ProductOut)
def edit_product(
    product_id: int,
    payload: product_schemas.ProductEditRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_edit(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    p: Product = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.sell_price_net is not None and payload.sell_price_net <= 0:
        raise HTTPException(status_code=400, detail="Price must be > 0")
    if payload.tax_rate is not None and payload.tax_rate < 0:
        raise HTTPException(status_code=400, detail="Tax rate must be >= 0")
    if payload.stock_quantity is not None and payload.stock_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock must be >= 0")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(p, field, value)

    db.commit()
    db.refresh(p)

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

    fields = list(product_schemas.ProductOut.model_fields.keys())
    data = {f: getattr(p, f) for f in fields if hasattr(p, f)}
    return product_schemas.ProductOut.model_validate(data)


# =========================
# USUWANIE PRODUKTU
# =========================
@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete products")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        write_log(
            db,
            user_id=current_user.id,
            action="PRODUCT_DELETE",
            resource="products",
            status="FAIL",
            ip=request.client.host if request.client else None,
            meta={"product_id": product_id, "reason": "not_found"},
        )
        raise HTTPException(status_code=404, detail="Product not found")

    pid, pcode, pname = product.id, product.code, product.name
    db.delete(product)
    db.commit()

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_DELETE",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": pid, "code": pcode, "name": pname},
    )

    return {"detail": f"Product '{pname}' (ID: {pid}) has been deleted successfully"}
