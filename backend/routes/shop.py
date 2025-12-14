from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from models.product import Product

# Schema for product display in the shop
class ProductShopResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str] = None
    category: Optional[str] = None
    sell_price_net: float
    tax_rate: Optional[float] = 23.0
    stock_quantity: int
    image_url: Optional[str] = None
    
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

# Retrieve unique product categories
@router.get("/categories", response_model=List[str])
def get_unique_categories(
    db: Session = Depends(get_db),
):
    # Fetch distinct non-null categories
    categories = db.query(Product.category).distinct().filter(Product.category != None).all()
    # Return list of strings
    return [c[0] for c in categories]

@router.get("/products", response_model=ProductShopPage)
def list_products_for_shop(
    request: Request,
    # Search and filter parameters
    q: Optional[str] = Query(None, description="Szukaj po nazwie, kodzie lub kategorii"),
    category: Optional[str] = Query(None, description="Filtruj po kategorii"),
    
    page: int = Query(12, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    sort_by: Literal["name", "sell_price_net", "stock_quantity"] = "name", 
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user), 
):
    query = db.query(Product)
    query = query.filter(Product.stock_quantity > 0) # Filter only available products

    # Apply general search filter
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Product.name.ilike(like),
                Product.code.ilike(like),
                Product.category.ilike(like),
            )
        )
    
    # Filter by specific category
    if category:
        query = query.filter(Product.category.ilike(f"%{category}%"))

    # Configure sorting logic
    allowed = {
        "name": Product.name,
        "sell_price_net": Product.sell_price_net,
        "stock_quantity": Product.stock_quantity, 
    }

    sort_key = sort_by.lower()
    sort_col = allowed.get(sort_key, Product.name)
    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())
        
    total = query.count()
    items: List[Product] = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total, "page": page, "page_size": page_size}