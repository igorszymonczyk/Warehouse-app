from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from database import Base

# Model Log
# Rejestruje zdarzenia i akcje wykonywane w systemie. Każdy wpis
# stanowi element audytu: zapisuje kto, kiedy i jaką akcję wykonał,
# wraz z podstawowymi metadanymi kontekstowymi.
class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)

    # Czas utworzenia logu oraz podstawowe dane akcji wykonywanej przez użytkownika.
    ts = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), index=True)
    resource = Column(String(50), index=True)
    status = Column(String(20), index=True)
    ip = Column(String(64), nullable=True)

    # Dodatkowe dane w formacie JSON – elastyczny kontener na szczegóły akcji.
    meta = Column(JSON, nullable=True)

    # Powiązanie z użytkownikiem, jeśli wpis dotyczy akcji wykonanej przez zalogowaną osobę.
    user = relationship("User", lazy="joined", uselist=False)
