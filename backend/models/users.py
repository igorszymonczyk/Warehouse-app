# backend/models/user.py
from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from database import Base

# Model User
# Przechowuje podstawowe dane konta użytkownika, takie jak adres e-mail,
# hasło w postaci hashu oraz rolę systemową. Stanowi uproszczony model
# uwierzytelniania i autoryzacji w aplikacji.
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
