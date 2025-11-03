# routes/auth.py
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

router = APIRouter(tags=["Auth"])

# Rejestracja
@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db), request: Request = None):
    # 🔹 Wymuś małe litery dla emaila
    normalized_email = user.email.strip().lower()

    # 🔹 Sprawdź czy email istnieje (case-insensitive)
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

    # 🔹 Stwórz użytkownika
    hashed_password = get_password_hash(user.password)
    new_user = models.User(email=normalized_email, password_hash=hashed_password, role="customer")
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

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

# Logowanie
@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db), request: Request = None):
    db_user = db.query(models.User).filter(models.User.email == payload.email).first()

    # Walidacja poświadczeń
    if not db_user or not verify_password(payload.password, db_user.password_hash):
        # log nieudanej próby logowania
        if request:
            write_log(db, user_id=(db_user.id if db_user else None), action="LOGIN", resource="auth",
                      status="FAIL", ip=request.client.host, meta={"email": payload.email})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Tworzenie tokenu
    access_token = create_access_token(data={"sub": db_user.email, "role": db_user.role})

    # log udanego logowania
    if request:
        write_log(db, user_id=db_user.id, action="LOGIN", resource="auth",
                  status="SUCCESS", ip=request.client.host, meta={"email": db_user.email})

    return {"access_token": access_token, "token_type": "bearer"}


# Informacje o aktualnym użytkowniku (przydatne do testów frontu)
@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
