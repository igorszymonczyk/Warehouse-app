# backend/models/stock.py
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    qty = Column(Integer, nullable=False) 
    
    reason = Column(String, nullable=True)
    type = Column(String, nullable=False) # IN, OUT, LOSS, ADJUSTMENT
    
    # NOWE POLE
    supplier = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product")
    user = relationship("User")