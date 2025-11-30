# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base, init_db
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Import routerów (zachowuję Twój styl importów "as ..._router")
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

# 1. NOWY IMPORT STOCK
from routes.stock import router as stock_router 

# Inicjalizacja
init_db()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Warehouse App API", version="1.0.0")

# Uploads
Path("static/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="static/uploads"), name="uploads")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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

# 2. REJESTRACJA STOCK Z PREFIKSEM
# Dzięki temu endpointy będą dostępne pod /stock (lista) i /stock/adjust (korekta)
app.include_router(stock_router, prefix="/stock") 

@app.get("/")
def read_root():
    return {"message": "Warehouse App API działa!"}