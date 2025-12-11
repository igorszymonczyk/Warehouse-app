from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending_payment")
    total_amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Payment integration details
    payu_order_id = Column(String, nullable=True)
    payment_url = Column(String, nullable=True)
    payment_status = Column(String, default="pending")

    # Billing address and invoice details
    invoice_buyer_name = Column(String, nullable=True)
    invoice_buyer_nip = Column(String, nullable=True)
    invoice_address_street = Column(String, nullable=True)
    invoice_address_zip = Column(String, nullable=True)
    invoice_address_city = Column(String, nullable=True)

    # Shipping address details
    shipping_address_street = Column(String, nullable=True)
    shipping_address_zip = Column(String, nullable=True)
    shipping_address_city = Column(String, nullable=True)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    qty = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    
    order = relationship("Order", back_populates="items")
    product = relationship("Product")