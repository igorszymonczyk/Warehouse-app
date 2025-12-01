# backend/models/WarehouseDoc.py
import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Enum, func
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
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    buyer_name = Column(String, nullable=True)
    shipping_address = Column(String, nullable=True) 
    invoice_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(WarehouseStatus), default=WarehouseStatus.NEW)
    items_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    invoice = relationship("Invoice", back_populates="warehouse_doc")