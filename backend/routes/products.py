# backend/routes/products.py
from typing import Optional, List, Union
from fastapi import (
    APIRouter, Depends, HTTPException, Query, Request, 
    UploadFile, File, Form
)
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import ValidationError, BaseModel 
from sqlalchemy.sql.expression import ColumnElement 

import shutil
import uuid
import os
from pathlib import Path

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
import schemas.product as product_schemas
from urllib.parse import urljoin

# Import systemu rekomendacji (z fallbackiem)
try:
    from utils.recommender import get_recommendations
except ImportError:
    def get_recommendations(products, rules=None): return []

class ProductNameList(BaseModel):
    product_names: List[str]

def _full_url(request: Request, path: Union[str, None]) -> Union[str, None]:
    if not path:
        return None
    return urljoin(str(request.base_url), path.lstrip("/"))

router = APIRouter(tags=["Products"])

# Ścieżka do zapisu plików
UPLOAD_DIR = Path("static/uploads")

# ---- HELPERS ----
def _role_ok(user: User) -> bool:
    """Zezwól na dostęp dla ADMIN/SALESMAN."""
    role = (user.role or "").upper()
    return role in {"ADMIN", "SALESMAN"}

def _can_edit(user: User) -> bool:
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

def _get_unique_values(db: Session, column: ColumnElement) -> List[str]:
    values = db.query(column).distinct().filter(column != None, column != "").all()
    return [v[0] for v in values]


# ==========================================
#  REKOMENDACJE
# ==========================================
@router.post("/products/recommend", response_model=List[product_schemas.ProductResponse])
def recommend_products_endpoint(
    payload: ProductNameList,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Zwraca listę sugerowanych produktów na podstawie nazw już wybranych."""
    if not payload.product_names:
        return []

    # 1. Pobierz nazwy rekomendowanych produktów
    suggested_names = get_recommendations(payload.product_names)

    if not suggested_names:
        return []

    # 2. Pobierz obiekty z bazy
    suggested_products = db.query(Product).filter(
        Product.name.in_(suggested_names),
        Product.stock_quantity > 0
    ).limit(5).all()

    # Serializacja
    product_fields = list(product_schemas.ProductResponse.model_fields.keys())
    serialized = []
    for p in suggested_products:
        data = {f: getattr(p, f) for f in product_fields if hasattr(p, f)}
        serialized.append(product_schemas.ProductResponse.model_validate(data))

    return serialized


# =========================
# LISTA PRODUKTÓW
# =========================
@router.get("/products", response_model=product_schemas.ProductListPage)
def list_products(
    request: Request,
    name: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    
    page: int = Query(1, ge=1),
    # ZWIĘKSZONY LIMIT DLA WYSZUKIWANIA FRONTENDOWEGO
    page_size: int = Query(10, ge=1, le=10000), 
    sort_by: str = Query("id"),
    order: str = Query("asc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    query = db.query(Product)

    if name: query = query.filter(Product.name.ilike(f"%{name}%"))
    if code: query = query.filter(Product.code.ilike(f"%{code}%"))
    if supplier: query = query.filter(Product.supplier.ilike(f"%{supplier}%"))
    if category: query = query.filter(Product.category.ilike(f"%{category}%"))
    if location: query = query.filter(Product.location.ilike(f"%{location}%"))

    allowed = {
        "id": Product.id, "code": Product.code, "name": Product.name,
        "sell_price_net": Product.sell_price_net, "stock_quantity": Product.stock_quantity,
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
        db, user_id=current_user.id, action="PRODUCTS_LIST", resource="products",
        status="SUCCESS", ip=request.client.host if request.client else None,
        meta={"page": page, "returned": len(items)},
    )

    return {"items": serialized, "total": total, "page": page, "page_size": page_size}


# =========================
# ENDPOINTY POMOCNICZE
# =========================
@router.get("/products/unique/categories", response_model=List[str])
def get_product_categories(db: Session = Depends(get_db)):
    return _get_unique_values(db, Product.category)

@router.get("/products/unique/suppliers", response_model=List[str])
def get_product_suppliers(db: Session = Depends(get_db)):
    return _get_unique_values(db, Product.supplier)

@router.get("/products/unique/locations", response_model=List[str])
def get_product_locations(db: Session = Depends(get_db)):
    return _get_unique_values(db, Product.location)


# =========================
# POJEDYNCZY PRODUKT
# =========================
@router.get("/products/{product_id}", response_model=product_schemas.ProductResponse)
def get_product(
    product_id: int, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

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

    norm_code = _norm_code(code)
    exists = db.query(Product).filter(Product.code == norm_code).first()
    if exists:
        raise HTTPException(status_code=409, detail="Product code already exists")

    file_url = None
    if file:
        if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        ext = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{ext}"
        save_path = UPLOAD_DIR / unique_filename
        file_url = f"/uploads/{unique_filename}" 
        try:
            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File save error: {e}")
        finally:
            file.file.close()

    new_product = Product(
        name=name, code=norm_code, sell_price_net=sell_price_net,
        stock_quantity=stock_quantity, buy_price=buy_price,
        description=description, category=category, supplier=supplier,
        tax_rate=tax_rate, location=location, comment=comment,
        image_url=file_url
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    write_log(
        db, user_id=current_user.id, action="PRODUCT_CREATE", resource="products",
        status="SUCCESS", meta={"id": new_product.id, "code": new_product.code}
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(new_product, f) for f in fields if hasattr(new_product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# AKTUALIZACJA PRODUKTU (PUT - Pełna)
# =========================
@router.put("/products/{product_id}", response_model=product_schemas.ProductResponse)
def update_product(
    product_id: int, updated_data: product_schemas.ProductCreate,
    request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for key, value in updated_data.model_dump().items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    
    write_log(
        db, user_id=current_user.id, action="PRODUCT_UPDATE", resource="products",
        status="SUCCESS", meta={"id": product.id}
    )

    fields = list(product_schemas.ProductResponse.model_fields.keys())
    data = {f: getattr(product, f) for f in fields if hasattr(product, f)}
    return product_schemas.ProductResponse.model_validate(data)


# =========================
# CZĘŚCIOWA EDYCJA PRODUKTU (PATCH) - NAPRAWIONA (Form + File)
# =========================
@router.patch("/products/{product_id}/edit", response_model=product_schemas.ProductOut)
def edit_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    # ZMIANA: Parametry jako Form(...) i File(...) aby obsłużyć multipart/form-data
    file: Optional[UploadFile] = File(None),
    name: Optional[str] = Form(None),
    code: Optional[str] = Form(None),
    sell_price_net: Optional[float] = Form(None),
    stock_quantity: Optional[int] = Form(None),
    buy_price: Optional[float] = Form(None),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    supplier: Optional[str] = Form(None),
    tax_rate: Optional[float] = Form(None),
    location: Optional[str] = Form(None),
    comment: Optional[str] = Form(None)
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    # Obsługa pliku
    if file:
        if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        ext = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{ext}"
        save_path = UPLOAD_DIR / unique_filename
        file_url = f"/uploads/{unique_filename}"
        
        try:
            if p.image_url:
                old_path = Path(".") / "static" / p.image_url.lstrip("/") 
                if old_path.exists() and "uploads" in str(old_path):
                    os.remove(old_path)

            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            p.image_url = file_url
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File save error: {e}")
        finally:
            file.file.close()

    # Aktualizacja pól (jeśli przesłane)
    if name is not None: p.name = name
    if code is not None:
        c = _norm_code(code)
        if c != p.code:
            conflict = db.query(Product).filter(Product.code == c, Product.id != p.id).first()
            if conflict: raise HTTPException(409, "Product code already exists")
        p.code = c
    if sell_price_net is not None: 
        if sell_price_net <= 0: raise HTTPException(400, "Price must be > 0")
        p.sell_price_net = sell_price_net
    if stock_quantity is not None:
        if stock_quantity < 0: raise HTTPException(400, "Stock must be >= 0")
        p.stock_quantity = stock_quantity
    if buy_price is not None: p.buy_price = buy_price
    if description is not None: p.description = description
    if category is not None: p.category = category
    if supplier is not None: p.supplier = supplier
    if tax_rate is not None: p.tax_rate = tax_rate
    if location is not None: p.location = location
    if comment is not None: p.comment = comment

    db.commit()
    db.refresh(p)

    write_log(
        db, user_id=current_user.id, action="PRODUCT_EDIT", resource="products",
        status="SUCCESS", meta={"product_id": p.id}
    )

    fields = list(product_schemas.ProductOut.model_fields.keys())
    out = {f: getattr(p, f) for f in fields if hasattr(p, f)}
    return product_schemas.ProductOut.model_validate(out)


# =========================
# MASOWE SZCZEGÓŁY
# =========================
@router.post("/products/details", response_model=List[product_schemas.ProductResponse])
def get_products_by_names(
    payload: ProductNameList, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    if not current_user: raise HTTPException(403, "Not authenticated")
    products = db.query(Product).filter(Product.name.in_(payload.product_names)).all()
    
    product_fields = list(product_schemas.ProductResponse.model_fields.keys())
    serialized = []
    for p in products:
        data = {f: getattr(p, f) for f in product_fields if hasattr(p, f)}
        serialized.append(product_schemas.ProductResponse.model_validate(data))
    return serialized


# =========================
# USUWANIE
# =========================
@router.delete("/products/{product_id}")
def delete_product(
    product_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user): raise HTTPException(403, "Not authorized")
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product: raise HTTPException(404, "Product not found")
    pid, pname = product.id, product.name
    db.delete(product)
    db.commit()
    write_log(db, user_id=current_user.id, action="PRODUCT_DELETE", resource="products", status="SUCCESS", meta={"id": pid})
    return {"detail": f"Product '{pname}' deleted"}