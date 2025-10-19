import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import relationship
from database import Base

class WarehouseStatus(str, enum.Enum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    RELEASED = "RELEASED"
    CANCELLED = "CANCELLED"

class WarehouseDocument(Base):
    __tablename__ = "warehouse_documents"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)  # data utworzenia dokumentu
    buyer_name = Column(String, nullable=False)
    invoice_date = Column(DateTime, nullable=False)  # data wystawienia faktury
    items_json = Column(String, nullable=False)      # lista produktów w formie JSON
    status = Column(Enum(WarehouseStatus), default=WarehouseStatus.NEW, nullable=False)

    # relacja z fakturą
    invoice = relationship("Invoice", back_populates="warehouse_doc")
