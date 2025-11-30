# models/stock.py
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base

# Model StockMovement
# Reprezentuje pojedynczy ruch magazynowy — np. przyjęcie towaru, korektę ilości
# zmianę stanu magazynowego wraz z kontekstem jej powstania.
class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)

    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    type = Column(String, nullable=False)
    qty = Column(Float, nullable=False)
    doc_type = Column(String, nullable=True)
    doc_id = Column(Integer, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Odwołanie do produktu — przydatne m.in. do analizy lub debugowania.
    product = relationship("Product")
