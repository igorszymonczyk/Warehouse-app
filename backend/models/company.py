from sqlalchemy import Column, Integer, String
from database import Base


# Model Company (Tabela 'company')
# Reprezentuje podstawowe dane teleadresowe i identyfikacyjne firmy.
class Company(Base):
    __tablename__ = "company" 

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True) 
    nip = Column(String, nullable=True) 
    address = Column(String, nullable=True) 
    phone = Column(String, nullable=True) 
    email = Column(String, nullable=True)