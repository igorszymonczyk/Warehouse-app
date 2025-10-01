from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

from utils.hashing import get_password_hash, verify_password
from utils.tokenJWT import create_access_token, get_current_user
from models import users as models
from schemas import user as schemas  
from database import get_db  



router = APIRouter(tags=["Auth"])

# Rejestracja
@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # domyślna rola customer
    role_to_assign = "customer"

    # sprawdź czy email nie istnieje
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # utwórz usera
    hashed_password = get_password_hash(user.password)
    new_user = models.User(email=user.email, password_hash=hashed_password, role=role_to_assign)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # dodaj do tabeli Customer
    db_role = models.Customer(user_id=new_user.id, imie=user.imie, nazwisko=user.nazwisko)
    db.add(db_role)
    db.commit()

    return new_user


# Logowanie

@router.post("/login", response_model=schemas.Token)
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(
        data={"sub": db_user.email, "role": db_user.role}
    )
    return {"access_token": access_token, "token_type": "bearer"}

#wyświtlanie zarejestrowanych kont
@router.get("/users", response_model=list[schemas.UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # dostęp tylko dla admina
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    users = db.query(models.User).all()
    return users