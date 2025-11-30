# backend/models/warehouse_document.py
import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func, Enum
from sqlalchemy.orm import relationship
from database import Base

# Status dokumentu magazynowego — pozwala kontrolować przebieg procesu
# obsługi dokumentu (od utworzenia po zakończenie lub anulowanie).
class WarehouseStatus(str, enum.Enum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    RELEASED = "RELEASED"
    CANCELLED = "CANCELLED"

# Model WarehouseDocument
# Przechowuje dokument magazynowy powiązany z fakturą. Zawiera dane
# odbiorcy, daty, listę pozycji w formie JSON oraz status obsługi.
# Służy jako zapis operacji magazynowych wynikających z wystawienia faktury.
class WarehouseDocument(Base):
    __tablename__ = "warehouse_documents"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    buyer_name = Column(String, nullable=False)
    invoice_date = Column(DateTime, nullable=False)

    # Pozycje dokumentu zapisane w formie JSON — snapshot produktów i ilości.
    items_json = Column(String, nullable=False)

    status = Column(Enum(WarehouseStatus), default=WarehouseStatus.NEW, nullable=False)

    # Powiązanie z fakturą źródłową.
    invoice = relationship("Invoice", back_populates="warehouse_doc")
