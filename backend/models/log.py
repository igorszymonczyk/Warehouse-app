from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from database import Base

class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), index=True)       
    resource = Column(String(50), index=True)    
    status = Column(String(20), index=True)      
    ip = Column(String(64), nullable=True)
    meta = Column(JSON, nullable=True)

    user = relationship("User", lazy="joined", uselist=False)
