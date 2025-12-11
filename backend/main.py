# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base, init_db
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

# Import routerów
from routes.auth import router as auth_router
from routes.admin import router as admin_router
from routes.logs import router as logs_router
from routes.cart import router as cart_router
from routes.invoice import router as invoice_router
from routes.company import router as company_router
from routes.warehouse import router as warehouse_router
from routes.documents import router as documents_router
from routes.orders import router as orders_router
from routes.reports import router as reports_router
from routes.products import router as products_router
from routes.stats import router as stats_router
from routes.shop import router as shop_router
from routes.salesman import router as salesman_router
from routes.payu import router as payu_router
from routes.stock import router as stock_router 

# Inicjalizacja
init_db()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Warehouse App API", version="1.0.0")

# Uploads - upewniamy się, że katalog istnieje
Path("static/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="static/uploads"), name="uploads")

# CORS Configuration
# Pobieramy URL frontendu ze zmiennych środowiskowych (Azure) lub używamy domyślnych lokalnych
frontend_url = os.getenv("FRONTEND_URL")
origins = [
    "http://localhost:5173", 
    "http://127.0.0.1:5173"
]

if frontend_url:
    origins.append(frontend_url)

# W pliku backend/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # <--- UWAGA: Tymczasowo pozwalamy na wszystko, żeby ułatwić start
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rejestracja routerów
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(logs_router)
app.include_router(cart_router)
app.include_router(invoice_router)
app.include_router(company_router)
app.include_router(warehouse_router)
app.include_router(documents_router)
app.include_router(orders_router)
app.include_router(reports_router)
app.include_router(products_router)
app.include_router(stats_router)
app.include_router(shop_router)
app.include_router(salesman_router)
app.include_router(payu_router)

# Rejestracja Stock
app.include_router(stock_router, prefix="/stock") 

@app.get("/")
def read_root():
    return {"message": "Warehouse App API działa!"}