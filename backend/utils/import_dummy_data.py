from pathlib import Path

# Ensure upload folder exists
UPLOAD_DIR = Path("static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

import requests
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models.users import User
from models.product import Product
from utils.hashing import get_password_hash
from sqlalchemy import func

def import_dummy_users(db: Session):
    print("📥 Importing users from DummyJSON...")
    res = requests.get("https://dummyjson.com/users?limit=20")
    users = res.json().get("users", [])
    count = 0

    for u in users:
        email = u["email"].lower()
        exists = db.query(User).filter(func.lower(User.email) == email).first()
        if exists:
            continue
        user = User(
            email=email,
            password_hash=get_password_hash("password123"),
            role="customer"
        )
        db.add(user)
        count += 1

    db.commit()
    print(f"✅ Imported {count} new users.")


def import_dummy_products(db: Session):
    print("📦 Importing products from DummyJSON...")
    res = requests.get("https://dummyjson.com/products?limit=50")
    products = res.json().get("products", [])
    count = 0

    for p in products:
        code = p["id"]
        exists = db.query(Product).filter(Product.code == str(code)).first()
        if exists:
            continue
        product = Product(
            name=p["title"],
            code=str(code),
            description=p.get("description"),
            category=p.get("category"),
            supplier=p.get("brand", "DummyBrand"),
            buy_price=float(p.get("price", 0)) * 0.6,  # 💰 domyślnie 60% ceny sprzedaży
            sell_price_net=float(p["price"]),
            stock_quantity=int(p["stock"]),
            tax_rate=23,
            location="Warehouse A",
            comment="Imported from DummyJSON",
        )

        if p.get("thumbnail"):
            product.image_url = p["thumbnail"]

        db.add(product)
        count += 1

    db.commit()
    print(f"✅ Imported {count} new products.")


def main():
    db = SessionLocal()
    try:
        import_dummy_users(db)
        import_dummy_products(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
