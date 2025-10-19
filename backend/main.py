from fastapi import FastAPI
from dotenv import load_dotenv
from database import init_db
load_dotenv()
from routes.auth import router as auth_router
from routes.logs import router as logs_router
from database import engine, Base
from routes.admin import router as admin_router
from routes.salesman import router as salesman_router
from routes.cart import router as cart_router
from routes.invoice import router as invoice_router
from routes.warehouse import router as warehouse_router

# Utworzenie instancji FastAPI
app = FastAPI(
    title="Warehouse App API",
    description="Backend do zarządzania magazynem",
    version="1.0.0"
)

init_db()  # Inicjalizacja bazy danych i tworzenie tabel

Base.metadata.create_all(bind=engine)
# Dodanie routera auth
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(salesman_router)
app.include_router(logs_router)
app.include_router(cart_router)
app.include_router(invoice_router)
app.include_router(warehouse_router)

# Opcjonalny root endpoint
@app.get("/")
def read_root():
    return {"message": "Warehouse App API działa!"}
