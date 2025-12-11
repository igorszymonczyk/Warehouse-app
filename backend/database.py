# backend/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# 1. Pobierz adres z systemu (Azure) lub użyj domyślnego SQLite (Lokalnie)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database_warehouseapp.db")

# 2. Poprawka dla Azure (zamienia postgres:// na postgresql://, bo SQLAlchemy tego wymaga)
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 3. Konfiguracja zależna od bazy
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    connect_args = {"check_same_thread": False} # Tylko dla SQLite
else:
    connect_args = {} # Puste dla PostgreSQL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)