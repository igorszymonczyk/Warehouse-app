# database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

#adres bazy danych SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///./database_warehouseapp.db"

# Tworzenie silnika bazy danych
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
# Tworzenie sesji
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Podstawa dla modeli
Base = declarative_base()

# Dependency do uzyskiwania sesji bazy danych
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Inicjalizacja bazy danych
def init_db():
    Base.metadata.create_all(bind=engine)




