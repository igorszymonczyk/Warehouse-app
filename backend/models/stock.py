# models/stock.py
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)

    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    # "in" (przyjęcie), "adjust" (korekta +/-)
    type = Column(String, nullable=False)

    # ilość zapisujemy jako wartość dodatnią; przy adjust kierunek wnioskujemy po kontekście
    qty = Column(Float, nullable=False)

    # powiązanie z dokumentem źródłowym (opcjonalnie)
    doc_type = Column(String, nullable=True)  # np. "manual", "invoice", "order"
    doc_id = Column(Integer, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # relacje (opcjonalne, przydatne w debugowaniu)
    product = relationship("Product")
