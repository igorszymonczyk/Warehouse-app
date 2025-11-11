# database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./database_warehouseapp.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- NEW: create tables on startup ---
def init_db():
    # Importuj WSZYSTKIE modele, żeby SQLAlchemy je znało
    import models.users           # noqa: F401
    import models.product         # noqa: F401
    import models.cart            # noqa: F401  # <-- dodałeś/aś przed chwilą

    Base.metadata.create_all(bind=engine)
