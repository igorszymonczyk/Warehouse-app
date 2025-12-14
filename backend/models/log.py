from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from database import Base

# Represents system audit logs tracking user actions and events
class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)

    # Event timestamp and core action details
    ts = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), index=True)
    resource = Column(String(50), index=True)
    status = Column(String(20), index=True)
    ip = Column(String(64), nullable=True)

    # JSON container for flexible context data
    meta = Column(JSON, nullable=True)

    # Relationship to the acting user
    user = relationship("User", lazy="joined", uselist=False)