# backend/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from utils.hashing import get_password_hash, verify_password
from utils.tokenJWT import create_access_token, get_current_user
from utils.audit import write_log
from models import users as models
from schemas import user as schemas
from database import get_db
from sqlalchemy import func

router = APIRouter(tags=["Auth"])

# Endpointy autoryzacyjne
# --------------------------------
# Moduł Auth obsługuje:
# - rejestrację nowych użytkowników,
# - logowanie i generowanie tokenów JWT,
# - pobieranie informacji o aktualnym zalogowanym użytkowniku.
# Każda operacja logowana jest w systemie audytu.

# Rejestracja nowego użytkownika.
@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db), request: Request = None):
    # Normalizacja e-maila (małe litery)
    normalized_email = user.email.strip().lower()

    # Sprawdzenie, czy użytkownik już istnieje
    db_user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
    if db_user:
        if request:
            write_log(
                db,
                user_id=None,
                action="REGISTER",
                resource="auth",
                status="FAIL",
                ip=request.client.host,
                meta={"email": user.email, "reason": "Email exists"},
            )
        raise HTTPException(status_code=400, detail="Email already registered")

    # Tworzenie nowego użytkownika i zapis w bazie
    hashed_password = get_password_hash(user.password)
    new_user = models.User(email=normalized_email, password_hash=hashed_password, role="customer")
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Logowanie pomyślnej rejestracji
    if request:
        write_log(
            db,
            user_id=new_user.id,
            action="REGISTER",
            resource="auth",
            status="SUCCESS",
            ip=request.client.host,
            meta={"email": new_user.email},
        )

    return new_user


# Logowanie użytkownika
@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db), request: Request = None):
    db_user = db.query(models.User).filter(models.User.email == payload.email).first()

    # Weryfikacja poświadczeń i logowanie nieudanych prób
    if not db_user or not verify_password(payload.password, db_user.password_hash):
        if request:
            write_log(db, user_id=(db_user.id if db_user else None), action="LOGIN", resource="auth",
                      status="FAIL", ip=request.client.host, meta={"email": payload.email})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Tworzenie tokenu JWT
    access_token = create_access_token(data={"sub": db_user.email, "role": db_user.role})

    # Logowanie udanego logowania
    if request:
        write_log(db, user_id=db_user.id, action="LOGIN", resource="auth",
                  status="SUCCESS", ip=request.client.host, meta={"email": db_user.email})

    return {"access_token": access_token, "token_type": "bearer"}


# Pobranie informacji o aktualnie zalogowanym użytkowniku
# Przydatne do testów frontu lub weryfikacji tokena JWT
@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
    