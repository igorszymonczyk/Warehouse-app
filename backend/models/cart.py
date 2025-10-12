from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Float, UniqueConstraint, func
from sqlalchemy.orm import relationship
from database import Base

class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    status = Column(String, default="open", index=True)  # 'open' | 'ordered'
    created_at = Column(DateTime, server_default=func.now())

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    qty = Column(Float, nullable=False, default=1)
    unit_price_snapshot = Column(Float, nullable=False)

    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")

    __table_args__ = (
        # w jednym koszyku nie duplikujemy product_id
        UniqueConstraint("cart_id", "product_id", name="uq_cartitem_cart_product"),
    )