from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from models.product import Product
import models

# importy schematów pod aliasami
from schemas import user as user_schemas
from schemas import product as product_schemas


router = APIRouter(tags=["Salesman"])

#Wyświetlanie wszystkich produktów
@router.get("/products", response_model=list[product_schemas.ProductResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["salesman", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    products = db.query(Product).all()
    return products

# Wyświetlanie pojedynczego produktu po ID
@router.get("/products/{product_id}", response_model=product_schemas.ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["salesman", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to view products")

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product

# Dodawanie produktu
@router.post("/products", response_model=product_schemas.ProductResponse)
def add_product(
    product: product_schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.users = Depends(get_current_user)
):
    if current_user.role not in ["salesman", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to add products")

    db_product = db.query(Product).filter(Product.code == product.code).first()
    if db_product:
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
        comment=product.comment
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product