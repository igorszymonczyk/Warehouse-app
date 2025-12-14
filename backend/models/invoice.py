from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, func, Enum, Boolean
from sqlalchemy.orm import relationship, backref
from database import Base
import enum

# Enum for invoice payment states
class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"

# Represents a sales invoice or a correction invoice
class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer, index=True, nullable=True) 
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True, nullable=True)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=True)
    
    # Buyer details
    buyer_name = Column(String, nullable=False)
    buyer_nip = Column(String, nullable=True)
    buyer_address = Column(String, nullable=True)
    
   
    shipping_address = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    total_net = Column(Float, nullable=False)
    total_vat = Column(Float, nullable=False)
    total_gross = Column(Float, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    
    # Correction fields
    is_correction = Column(Boolean, default=False, nullable=False)
    correction_reason = Column(String, nullable=True)
    parent_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    correction_seq = Column(Integer, default=1, nullable=True)

    # Relationships
    parent = relationship("Invoice", remote_side=[id], backref=backref("corrections", cascade="all, delete-orphan"))
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    warehouse_doc = relationship("WarehouseDocument", back_populates="invoice", uselist=False)

    # Generates the formatted invoice number string (handles corrections)
    @property
    def full_number(self):
        if self.is_correction:
            if self.parent:
                base_num = self.parent.number if self.parent.number else self.parent.id
            else:
                base_num = self.parent_id
            base = f"INV-{base_num}"
            seq = self.correction_seq or 1
            suffix = "/FK" if seq == 1 else f"/FK{seq - 1}"
            return f"{base}{suffix}"
        else:
            num = self.number if self.number else self.id
            return f"INV-{num}"

# Represents a line item on an invoice
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