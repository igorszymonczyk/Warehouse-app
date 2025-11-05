from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from database import init_db
load_dotenv()
from routes.auth import router as auth_router
from routes.logs import router as logs_router
from database import engine, Base
from routes.admin import router as admin_router
from routes.cart import router as cart_router
from routes.invoice import router as invoice_router
from routes.warehouse import router as warehouse_router
from routes.documents import router as documents_router
from routes.orders import router as orders_router
from routes.stock import router as stock_router
from routes.reports import router as reports_router
from routes.products import router as products_router

# Utworzenie instancji FastAPI
app = FastAPI(
    title="Warehouse App API",
    description="Backend do zarządzania magazynem",
    version="1.0.0"
)
# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()  # Inicjalizacja bazy danych i tworzenie tabel

Base.metadata.create_all(bind=engine)
# Dodanie routera auth
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(logs_router)
app.include_router(cart_router)
app.include_router(invoice_router)
app.include_router(warehouse_router)
app.include_router(documents_router)
app.include_router(orders_router)
app.include_router(stock_router)
app.include_router(reports_router)
app.include_router(products_router)

# Opcjonalny root endpoint
@app.get("/")
def read_root():
    return {"message": "Warehouse App API działa!"}
