from sqlalchemy import Column, Integer, String, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)


#nie wiem czy potrzebne rozdzielanie
# class Admin(Base):
#     __tablename__ = "admins"

#     id = Column(Integer, primary_key=True, index=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
#     imie = Column(String, nullable=False)
#     nazwisko = Column(String, nullable=False)


# class Seller(Base):
#     __tablename__ = "sellers"

#     id = Column(Integer, primary_key=True, index=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
#     imie = Column(String, nullable=False)
#     nazwisko = Column(String, nullable=False)

# class Warehouse_worker(Base):
#     __tablename__ = "warehouse_workers"

#     id = Column(Integer, primary_key=True, index=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
#     imie = Column(String, nullable=False)
#     nazwisko = Column(String, nullable=False)

# class Customer(Base):
#     __tablename__ = "customers"

#     id = Column(Integer, primary_key=True, index=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
#     imie = Column(String, nullable=False)
#     nazwisko = Column(String, nullable=False)

