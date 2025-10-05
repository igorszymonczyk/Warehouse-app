from fastapi import FastAPI
from routes.auth import router as auth_router
from database import engine, Base
from routes.admin import router as admin_router
# Utworzenie instancji FastAPI
app = FastAPI(
    title="Warehouse App API",
    description="Backend do zarządzania magazynem",
    version="1.0.0"
)

Base.metadata.create_all(bind=engine)
# Dodanie routera auth
app.include_router(auth_router)
app.include_router(admin_router)

# Opcjonalny root endpoint
@app.get("/")
def read_root():
    return {"message": "Warehouse App API działa!"}
