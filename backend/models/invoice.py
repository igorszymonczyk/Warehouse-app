import enum
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, func, Enum, Boolean
from sqlalchemy.orm import relationship, backref
from database import Base

# Enum określający możliwe stany płatności faktury.
# Zapewnia spójność zapisanych wartości w bazie.
class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"


# Model Invoice
# Reprezentuje pełny dokument faktury. Przechowuje
# informacje o nabywcy, powiązania z użytkownikiem i zamówieniem,
# datę wystawienia oraz sumy finansowe.
# Dane mają charakter snapshotu — zachowują stan z momentu wystawienia.
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

    is_correction = Column(Boolean, default=False, nullable=False)
    correction_reason = Column(String, nullable=True)
    parent_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    correction_seq = Column(Integer, default=1, nullable=True)
    # Relacja do samej siebie (korekta wskazuje na fakturę oryginalną)
    parent = relationship("Invoice", remote_side=[id], backref=backref("corrections", cascade="all, delete-orphan"))

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    warehouse_doc = relationship("WarehouseDocument", back_populates="invoice", uselist=False)

    @property
    def full_number(self):
            # Jeśli to nie korekta, zwróć standardowy numer faktury
        if not self.is_correction:
            return f"INV-{self.id}"
        
        # Jeśli to korekta, bazą jest ID rodzica
        base = f"INV-{self.parent_id}"
        
        seq = self.correction_seq or 1
        if seq == 1:
            return f"{base}/FK"
        else:
            return f"{base}/FK{seq - 1}"

# Model InvoiceItem
# Reprezentuje pojedynczą linię faktury. Każda pozycja przechowuje
# dane produktu oraz ceny jako snapshot z momentu wystawienia faktury.
class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)

    # Klucze obce do faktury oraz produktu.
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))

    # Snapshot szczegółów produktu.
    product_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    price_net = Column(Float, nullable=False)
    tax_rate = Column(Float, nullable=False)

    # Podsumowania pozycji.
    total_net = Column(Float, nullable=False)
    total_gross = Column(Float, nullable=False)

    # Relacje ORM
    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product")
