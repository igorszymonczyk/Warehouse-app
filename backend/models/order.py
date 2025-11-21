# backend/models/order.py
from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Float, func
from sqlalchemy.orm import relationship
from database import Base
from models.product import Product

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    status = Column(String, default="pending", index=True)  # pending|processing|shipped
    total_amount = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
    invoice_buyer_name = Column(String, nullable=True) 
    invoice_contact_person = Column(String, nullable=True)
    invoice_buyer_nip = Column(String, nullable=True)
    invoice_address_street = Column(String, nullable=True) 
    invoice_address_zip = Column(String, nullable=True) 
    invoice_address_city = Column(String, nullable=True)
    payment_url = Column(String, nullable=True)
    payu_order_id = Column(String, index=True, nullable=True, unique=True)
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    qty = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")
