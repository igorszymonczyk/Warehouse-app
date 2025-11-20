# backend/routes/products.py
from typing import Optional, List, Union
from fastapi import (
    APIRouter, Depends, HTTPException, Query, Request, 
    UploadFile, File, Form
)
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import ValidationError, BaseModel 
# 1. ZMIANA: Import potrzebny do funkcji pomocniczej
from sqlalchemy.sql.expression import ColumnElement 

import shutil
import uuid
from pathlib import Path

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
import schemas.product as product_schemas
from urllib.parse import urljoin

class ProductNameList(BaseModel):
    product_names: List[str]

def _full_url(request: Request, path: Union[str, None]) -> Union[str, None]:
    if not path:
        return None
    return urljoin(str(request.base_url), path.lstrip("/"))

router = APIRouter(tags=["Products"])

# Ścieżka do zapisu plików (folder /backend/static/uploads/)
UPLOAD_DIR = Path("static/uploads")

# ---- helpers ----
def _role_ok(user: User) -> bool:
    """Zezwól na dostęp dla ADMIN/SALESMAN (bez względu na wielkość liter)."""
    role = (user.role or "").upper()
    return role in {"ADMIN", "SALESMAN"}

def _can_edit(user: User) -> bool:
    """Zezwól na edycję dla ADMIN/SALESMAN."""
    return _role_ok(user)

def _can_manage_stock(user: User) -> bool:
    """Zezwól na dostęp dla ADMIN/SALESMAN/WAREHOUSE."""
    role = (user.role or "").upper()
    return role in {"ADMIN", "SALESMAN", "WAREHOUSE"}

def _norm_code(code: Optional[str]) -> Optional[str]:
    if code is None:
        return None
    c = code.strip().upper()
    return c if c else None

# === 2. ZMIANA: NOWA FUNKCJA POMOCNICZA ===
def _get_unique_values(db: Session, column: ColumnElement) -> List[str]:
    """Pomocnik do pobierania unikalnych, niepustych wartości z danej kolumny."""
    values = db.query(column).distinct().filter(column != None, column != "").all()
    # values to lista krotek np. [('Kategoria A',), ('Kategoria B',)]
    return [v[0] for v in values]


# =========================
# LISTA PRODUKTÓW
# =========================
@router.get("/products", response_model=product_schemas.ProductListPage)
def list_products(
    request: Request,
    # 3. ZMIANA: Parametry filtrowania
    name: Optional[str] = Query(None, description="Filtruj po nazwie produktu"),
    code: Optional[str] = Query(None, description="Filtruj po kodzie produktu"),
    supplier: Optional[str] = Query(None, description="Filtruj po dostawcy"),
    category: Optional[str] = Query(None, description="Filtruj po kategorii"),
    location: Optional[str] = Query(None, description="Filtruj po lokalizacji"),
    
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
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    query = db.query(Product)

    # 4. ZMIANA: Logika filtrowania
    if name:
        query = query.filter(Product.name.ilike(f"%{name}%"))
    if code:
        query = query.filter(Product.code.ilike(f"%{code}%"))
    if supplier:
        query = query.filter(Product.supplier.ilike(f"%{supplier}%"))
    if category:
        query = query.filter(Product.category.ilike(f"%{category}%"))
    if location:
        query = query.filter(Product.location.ilike(f"%{location}%"))

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
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "order": order,
            "returned": len(items),
            "filters": {"name": name, "code": code, "supplier": supplier, "category": category, "location": location}
        },
    )

    return {"items": serialized, "total": total, "page": page, "page_size": page_size}


# =====================================================================
# 5. ZMIANA: NOWE ENDPOINTY MUSZĄ BYĆ TUTAJ (PRZED /{product_id}) !!!
# =====================================================================

@router.get("/products/unique/categories", response_model=List[str])
def get_product_categories(db: Session = Depends(get_db)):
    """Zwraca listę wszystkich unikalnych kategorii produktów."""
    return _get_unique_values(db, Product.category)

@router.get("/products/unique/suppliers", response_model=List[str])
def get_product_suppliers(db: Session = Depends(get_db)):
    """Zwraca listę wszystkich unikalnych dostawców produktów."""
    return _get_unique_values(db, Product.supplier)

@router.get("/products/unique/locations", response_model=List[str])
def get_product_locations(db: Session = Depends(get_db)):
    """Zwraca listę wszystkich unikalnych lokalizacji produktów."""
    return _get_unique_values(db, Product.location)


# =========================
# POJEDYNCZY PRODUKT (Dynamiczny URL - musi być po statycznych)
# =========================
@router.get("/products/{product_id}", response_model=product_schemas.ProductResponse)
def get_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: Optional[UploadFile] = File(None),
    name: str = Form(...),
    code: str = Form(...),
    sell_price_net: float = Form(...),
    stock_quantity: int = Form(...),
    buy_price: float = Form(0.0),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    supplier: Optional[str] = Form(None),
    tax_rate: Optional[float] = Form(23.0),
    location: Optional[str] = Form(None),
    comment: Optional[str] = Form(None)
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to add products")

    try:
        product_data = {
            "name": name, "code": code, "sell_price_net": sell_price_net,
            "stock_quantity": stock_quantity, "buy_price": buy_price,
            "description": description, "category": category, "supplier": supplier,
            "tax_rate": tax_rate, "location": location, "comment": comment
        }
        product = product_schemas.ProductCreate(**product_data)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    norm_code = _norm_code(product.code)
    if not norm_code:
        raise HTTPException(status_code=400, detail="Product code is required")

    exists = db.query(Product).filter(Product.code == norm_code).first()
    if exists:
        write_log(
            db, user_id=current_user.id, action="PRODUCT_CREATE", resource="products",
            status="FAIL", ip=request.client.host if request.client else None,
            meta={"code": norm_code, "reason": "code_exists"},
        )
        raise HTTPException(status_code=409, detail="Product code already exists")

    file_url = None
    if file:
        if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, WebP allowed.")
        
        file_extension = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        save_path = UPLOAD_DIR / unique_filename
        file_url = f"/uploads/{unique_filename}" 

        try:
            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
        finally:
            file.file.close()

    payload = product.model_dump()
    payload["code"] = norm_code
    
    new_product = Product(**payload)
    new_product.image_url = file_url 

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    write_log(
        db, user_id=current_user.id, action="PRODUCT_CREATE", resource="products",
        status="SUCCESS", ip=request.client.host if request.client else None,
        meta={"product_id": new_product.id, "code": new_product.code, "image_url": file_url},
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(new_product, f) for f in fields if hasattr(new_product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# AKTUALIZACJA PRODUKTU (PUT)
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
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    p: Product = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    # walidacje biznesowe
    if payload.sell_price_net is not None and payload.sell_price_net <= 0:
        raise HTTPException(status_code=400, detail="Price must be > 0")
    if payload.tax_rate is not None and payload.tax_rate < 0:
        raise HTTPException(status_code=400, detail="Tax rate must be >= 0")
    if payload.stock_quantity is not None and payload.stock_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock must be >= 0")

    data = payload.dict(exclude_unset=True)

    if "code" in data and data["code"] is not None:
        data["code"] = _norm_code(data["code"])
        if not data["code"]:
            raise HTTPException(status_code=400, detail="Product code cannot be empty")
        conflict = db.query(Product).filter(
            Product.code == data["code"], Product.id != p.id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Product code already exists")

    before = {k: getattr(p, k) for k in data.keys() if hasattr(p, k)}

    for field, value in data.items():
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
        meta={"product_id": p.id, "changed": {k: [before.get(k), getattr(p, k)] for k in data.keys()}},
    )

    fields = list(product_schemas.ProductOut.model_fields.keys())
    out = {f: getattr(p, f) for f in fields if hasattr(p, f)}
    return product_schemas.ProductOut.model_validate(out)

# =========================
# POBIERANIE SZCZEGÓŁÓW PO NAZWACH
# =========================
@router.post("/products/details", response_model=List[product_schemas.ProductResponse])
def get_products_by_names(
    payload: ProductNameList,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Dostęp jest dozwolony dla wszystkich zalogowanych (w tym klienta, który używa koszyka)
    if not current_user:
        raise HTTPException(status_code=403, detail="Not authenticated.")

    products = db.query(Product).filter(
        Product.name.in_(payload.product_names)
    ).all()

    product_fields = list(product_schemas.ProductResponse.model_fields.keys())
    serialized = []
    for p in products:
        data = {f: getattr(p, f) for f in product_fields if hasattr(p, f)}
        serialized.append(product_schemas.ProductResponse.model_validate(data))

    write_log(
        db,
        user_id=current_user.id,
        action="PRODUCTS_DETAILS_BY_NAME",
        resource="products",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"names_requested": len(payload.product_names), "returned": len(products)},
    )

    return serialized

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