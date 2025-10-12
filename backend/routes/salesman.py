# routes/salesman.py
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product

# importy schematów pod aliasami
from schemas import product as product_schemas

router = APIRouter(tags=["Salesman"])

# ---- helpers ----
def _role_ok(user: User) -> bool:
    """Zezwól na dostęp dla ADMIN/SALESMAN (bez względu na wielkość liter)."""
    role = (user.role or "").upper()
    return role in {"ADMIN", "SALESMAN"}

# =========================
# LISTA PRODUKTÓW (z q/sort/page)
# =========================
@router.get("/products", response_model=product_schemas.ProductsPage)
def list_products(
    request: Request,
    q: Optional[str] = Query(None, description="szukaj w: name, code, description, category, supplier"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["name", "sell_price_net", "stock_quantity", "created_at"] = "name",
    order: Literal["asc", "desc"] = "asc",
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

    # mapowanie kolumn sortowania
    sort_map = {
        "name": Product.name,
        "sell_price_net": Product.sell_price_net,
        "stock_quantity": Product.stock_quantity,
        "created_at": getattr(Product, "created_at", Product.id),  # fallback
    }
    col = sort_map[sort_by]
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    # AUDIT
    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCTS_LIST",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"q": q, "page": page, "page_size": page_size, "sort_by": sort_by, "order": order, "returned": len(items)},
    )

    return {"items": items, "total": total, "page": page, "page_size": page_size}

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
        # AUDIT (FAIL)
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

    # AUDIT (SUCCESS)
    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_GET",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": product_id},
    )
    return product

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
        # AUDIT (FAIL)
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

    new_product = Product(
        name=product.name,
        code=product.code,
        description=product.description,
        category=product.category,
        supplier=product.supplier,
        buy_price=product.buy_price,
        sell_price_net=product.sell_price_net,
        tax_rate=product.tax_rate,
        stock_quantity=product.stock_quantity,
        location=product.location,
        comment=product.comment,
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    # AUDIT (SUCCESS)
    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_CREATE",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": new_product.id, "code": new_product.code},
    )

    return new_product

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
        # AUDIT (FAIL)
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

    # AUDIT (SUCCESS)
    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCT_UPDATE",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"product_id": product.id, "changed": {k: (before[k], getattr(product, k)) for k in before}},
    )

    return product

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
        # AUDIT (FAIL)
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

    # AUDIT (SUCCESS)
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
