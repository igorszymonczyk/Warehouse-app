# backend/models/invoice.py
import enum
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import relationship
from database import Base

class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True, nullable=True)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=True)
    buyer_name = Column(String, nullable=False)
    buyer_nip = Column(String, nullable=True)
    buyer_address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    total_net = Column(Float, nullable=False)
    total_vat = Column(Float, nullable=False)
    total_gross = Column(Float, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    warehouse_doc = relationship("WarehouseDocument", back_populates="invoice", uselist=False)

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    product_name = Column(String, nullable=False)

    quantity = Column(Integer, nullable=False)
    price_net = Column(Float, nullable=False)
    tax_rate = Column(Float, nullable=False)
    total_net = Column(Float, nullable=False)
    total_gross = Column(Float, nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product")