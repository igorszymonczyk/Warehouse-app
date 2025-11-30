# backend/models/cart.py
from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Float, UniqueConstraint, func
from sqlalchemy.orm import relationship
from database import Base

# Model Cart (Tabela 'carts')
# Reprezentuje główny koszyk zakupowy użytkownika.
class Cart(Base):
    __tablename__ = "carts" # Tabela koszyków

    id = Column(Integer, primary_key=True, index=True) # Klucz główny
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False) # Powiązanie z tabelą użytkowników
    status = Column(String, default="open", index=True)  # Stan koszyka
    created_at = Column(DateTime, server_default=func.now()) # Data utworzenia koszyka

    # Relacja jeden-do-wielu do pozycji w koszyku (CartItem)
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


# Model CartItem (Tabela 'cart_items')
# Reprezentuje pojedynczą pozycję (produkt i ilość) w koszyku.
class CartItem(Base):
    __tablename__ = "cart_items" # Nazwa tabeli dla pozycji koszyka

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), index=True, nullable=False) # Klucz obcy do koszyka
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False) # Klucz obcy do produktu
    qty = Column(Float, nullable=False, default=1) # Ilość produktu
    unit_price_snapshot = Column(Float, nullable=False) # Zapisana cena jednostkowa (snapshot)

    cart = relationship("Cart", back_populates="items") # Relacja powrotna do Koszyka
    product = relationship("Product") # Relacja do modelu Produktu

    __table_args__ = (
        # Ograniczenie unikalności dla cart_id i product_id
        UniqueConstraint("cart_id", "product_id", name="uq_cartitem_cart_product"),
    )