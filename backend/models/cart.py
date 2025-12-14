# backend/models/cart.py
from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Float, UniqueConstraint, func
from sqlalchemy.orm import relationship
from database import Base

# Represents the user's shopping cart
class Cart(Base):
    __tablename__ = "carts" # Table name

    id = Column(Integer, primary_key=True, index=True) # Primary key
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False) # Foreign key to users
    status = Column(String, default="open", index=True)  # Cart status
    created_at = Column(DateTime, server_default=func.now()) # Creation timestamp

    # One-to-many relationship with cart items
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


# Represents a single item (product + quantity) within a cart
class CartItem(Base):
    __tablename__ = "cart_items" # Table name

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), index=True, nullable=False) # Foreign key to parent cart
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False) # Foreign key to product
    qty = Column(Float, nullable=False, default=1) # Product quantity
    unit_price_snapshot = Column(Float, nullable=False) # Unit price at the moment of addition

    cart = relationship("Cart", back_populates="items") # Relationship back to Cart
    product = relationship("Product") # Relationship to Product

    __table_args__ = (
        # Unique constraint to prevent duplicate product entries in the same cart
        UniqueConstraint("cart_id", "product_id", name="uq_cartitem_cart_product"),
    )