# database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite database connection URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./database_warehouseapp.db"

# Create the SQLAlchemy engine (SQLite-specific thread check disabled)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
# Configure the session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Base class for all ORM models
Base = declarative_base()

# Dependency to provide a database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize the database schema
def init_db():
    Base.metadata.create_all(bind=engine)