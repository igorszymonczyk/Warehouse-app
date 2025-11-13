# backend/routes/products.py
from typing import Optional, List
from fastapi import (
    APIRouter, Depends, HTTPException, Query, Request, 
    UploadFile, File, Form  # 1. ZMIANA: Import UploadFile, File, Form
)
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import ValidationError # 2. ZMIANA: Import do walidacji

# 3. ZMIANA: Importy do zapisu plików
import shutil
import uuid
from pathlib import Path

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
import schemas.product as product_schemas

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
    if not _can_manage_stock(current_user):
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
        # Uwzględniamy pole image_url, które dodaliśmy do schematu
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
    # ... (Ta funkcja zostaje bez zmian) ...
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
# 4. DUŻA ZMIANA: DODAWANIE PRODUKTU (z uploadem pliku)
# =========================
@router.post("/products", response_model=product_schemas.ProductResponse)
def add_product(
    # Zamiast Pydantic model, przyjmujemy pola formularza
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: Optional[UploadFile] = File(None),
    name: str = Form(...),
    code: str = Form(...),
    sell_price_net: float = Form(...),
    stock_quantity: int = Form(...),
    buy_price: float = Form(0.0), # Używamy 0.0 jako domyślnej
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    supplier: Optional[str] = Form(None),
    tax_rate: Optional[float] = Form(23.0),
    location: Optional[str] = Form(None),
    comment: Optional[str] = Form(None)
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to add products")

    # Walidujemy dane Pydantic "ręcznie"
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

    # Logika zapisu pliku
    file_url = None
    if file:
        if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, WebP allowed.")
        
        # Tworzy unikalną nazwę pliku
        file_extension = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        save_path = UPLOAD_DIR / unique_filename
        file_url = f"/uploads/{unique_filename}" # URL, który zapiszemy w bazie

        try:
            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
        finally:
            file.file.close()

    # Tworzenie obiektu bazy danych
    payload = product.model_dump()
    payload["code"] = norm_code
    
    new_product = Product(**payload)
    new_product.image_url = file_url # Zapisujemy URL do zdjęcia

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
    # ... (Ta funkcja zostaje bez zmian) ...
    # (Edycja zdjęcia to bardziej skomplikowana operacja, robimy ją oddzielnie)
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
    # ... (Ta funkcja zostaje bez zmian) ...
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

    # normalizacja + sprawdzenie konfliktu kodu
    if "code" in data and data["code"] is not None:
        data["code"] = _norm_code(data["code"])
        if not data["code"]:
            raise HTTPException(status_code=400, detail="Product code cannot be empty")
        conflict = db.query(Product).filter(
            Product.code == data["code"], Product.id != p.id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Product code already exists")

    # log: wartości przed zmianą
    before = {k: getattr(p, k) for k in data.keys() if hasattr(p, k)}

    # przypisz tylko przekazane pola
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
# USUWANIE PRODUKTU
# =========================
@router.delete("/products/{product_id}")
def delete_product(
    # ... (Ta funkcja zostaje bez zmian) ...
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