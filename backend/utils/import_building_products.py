# utils/import_building_products.py
import os, uuid, requests
from pathlib import Path
from database import SessionLocal, engine
from models.product import Product
from sqlalchemy import text

UPLOAD_DIR = Path("static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# minimalny zestaw budowlany – dopisz własne
BUILDING_PRODUCTS = [
    {
        "name": "Cement Portlandzki CEM I 32,5R",
        "code": "CEM325R",
        "description": "Uniwersalny cement do betonu i zapraw.",
        "category": "materiały budowlane",
        "supplier": "Lafarge",
        "buy_price": 18.50,
        "sell_price_net": 23.90,
        "tax_rate": 23,
        "stock_quantity": 240,
        "location": "Magazyn A",
        "comment": "Paleta 48 szt.",
        "image": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Cement_bag.jpg"
    },
    {
        "name": "Beton B20 (C16/20) 40kg",
        "code": "BETONB20",
        "description": "Sucha mieszanka betonowa C16/20.",
        "category": "materiały budowlane",
        "supplier": "Baumit",
        "buy_price": 13.00,
        "sell_price_net": 16.90,
        "tax_rate": 23,
        "stock_quantity": 50,
        "location": "Magazyn B",
        "comment": "Worki 40 kg",
        "image": "https://i.imgur.com/1V3m6uT.jpeg"
    },
    {
        "name": "Żwir 2–16 mm",
        "code": "ZWI2_16",
        "description": "Kruszywo drogowe, frakcja 2–16 mm.",
        "category": "kruszywa",
        "supplier": "Kopalnia X",
        "buy_price": 55.00,
        "sell_price_net": 69.00,
        "tax_rate": 23,
        "stock_quantity": 350,
        "location": "Plac składowy",
        "comment": "Na tony",
        "image": "https://i.imgur.com/0wqkq2x.jpeg"
    },
    {
        "name": "Pustak Porotherm 25 P+W",
        "code": "PUSTAK25PW",
        "description": "Pustak ceramiczny 25 cm, pióro-wpust.",
        "category": "cegły i pustaki",
        "supplier": "Wienerberger",
        "buy_price": 6.20,
        "sell_price_net": 7.90,
        "tax_rate": 23,
        "stock_quantity": 1800,
        "location": "Magazyn C",
        "comment": "",
        "image": "https://i.imgur.com/B5M5Q4K.jpeg"
    },
]

def download_image(url: str) -> str:
    """Pobiera obraz i zapisuje w static/uploads; zwraca '/uploads/<plik>'."""
    try:
        ext = (url.split("?")[0].split(".")[-1] or "jpg").lower()
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            ext = "jpg"
        fname = f"{uuid.uuid4()}.{ext}"
        dest = UPLOAD_DIR / fname
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        with open(dest, "wb") as f:
            f.write(r.content)
        return f"/uploads/{fname}"
    except Exception:
        return None  # brak obrazka – frontend pokaże placeholder

def main():
    db = SessionLocal()
    try:
        # Czyścimy tylko produkty (jeśli jeszcze nie zrobiłeś DELETE)
        db.execute(text("DELETE FROM products;"))
        db.commit()

        to_add = []
        for item in BUILDING_PRODUCTS:
            img_url = download_image(item["image"]) if item.get("image") else None

            p = Product(
                name=item["name"],
                code=item["code"].strip().upper(),
                description=item.get("description"),
                category=item.get("category"),
                supplier=item.get("supplier"),
                buy_price=item["buy_price"],
                sell_price_net=item["sell_price_net"],
                tax_rate=item.get("tax_rate", 23),
                stock_quantity=item.get("stock_quantity", 0),
                location=item.get("location"),
                comment=item.get("comment"),
                image_url=img_url,
            )
            to_add.append(p)

        db.add_all(to_add)
        db.commit()
        print(f"✅ Zaimportowano {len(to_add)} produktów budowlanych.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
