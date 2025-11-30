# backend/models/product.py
from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint
from database import Base

# Model Product
# Reprezentuje pojedynczy produkt dostępny w systemie.
# Przechowuje podstawowe dane katalogowe, ceny, stawkę VAT,
# informacje magazynowe oraz dodatkowe metadane jak lokalizacja czy komentarz.
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    code = Column(String, unique=True, nullable=False, index=True)

    description = Column(String)
    category = Column(String)
    supplier = Column(String)

    # Ceny oraz stawka podatkowa — kontrolowane poprzez ograniczenia.
    buy_price = Column(Integer, CheckConstraint("buy_price >= 0"), nullable=False)
    sell_price_net = Column(Integer, CheckConstraint("sell_price_net >= 0"), nullable=False)
    tax_rate = Column(Integer, CheckConstraint("tax_rate >= 0 AND tax_rate <= 100"), nullable=False)

    # Dane magazynowe.
    stock_quantity = Column(Integer, CheckConstraint("stock_quantity >= 0"), nullable=False)
    location = Column(String)

    comment = Column(String)

    # Opcjonalny URL zdjęcia produktu.
    image_url = Column(String, nullable=True)
