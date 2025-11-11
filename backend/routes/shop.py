# backend/routers/shop.py

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from models.product import Product

# 1. ZMIANA: Zaktualizuj schematy, aby zawierały image_url

class ProductShopResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str] = None
    category: Optional[str] = None
    sell_price_net: float
    tax_rate: Optional[float] = 23.0
    stock_quantity: int
    image_url: Optional[str] = None # <-- DODANE
    
    class Config:
        from_attributes = True

class ProductShopPage(BaseModel):
    items: List[ProductShopResponse]
    total: int
    page: int
    page_size: int


router = APIRouter(
    prefix="/shop",
    tags=["Shop"]
)

@router.get("/products", response_model=ProductShopPage)
def list_products_for_shop(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po nazwie, kodzie lub kategorii"),
    page: int = Query(12, ge=1), # Zmienione domyślne query na 12
    page_size: int = Query(12, ge=1, le=100),
    sort_by: str = Query("name", description="Pole sortowania: name, sell_price_net"),
    order: str = Query("asc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user), 
):
    query = db.query(Product)
    query = query.filter(Product.stock_quantity > 0)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Product.name.ilike(like),
                Product.code.ilike(like),
                Product.category.ilike(like),
            )
        )

    allowed = {
        "name": Product.name,
        "sell_price_net": Product.sell_price_net,
    }

    sort_key = sort_by.lower()
    sort_col = allowed.get(sort_key, Product.name)
    query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    total = query.count()
    items: List[Product] = query.offset((page - 1) * page_size).limit(page_size).all()

    # 2. ZMIANA: Zwracamy dane, które Pydantic sam zwaliduje
    return {"items": items, "total": total, "page": page, "page_size": page_size}