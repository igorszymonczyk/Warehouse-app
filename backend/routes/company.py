# backend/routes/company.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models.company import Company
from models.users import User
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from schemas.company import CompanyOut, CompanyUpdate

router = APIRouter(prefix="/company", tags=["Company"])

# Moduł Company
# Obsługuje informacje o firmie: odczyt danych oraz aktualizację.
# Aktualizacja dostępna tylko dla administratora. Każda zmiana logowana jest w systemie audytu.

def _is_admin(user: User) -> bool:
    # Prosta weryfikacja roli administratora
    return (user.role or "").upper() == "ADMIN"


# Pobranie danych firmy
@router.get("/", response_model=CompanyOut)
def get_company(db: Session = Depends(get_db)):
    c = db.query(Company).first()
    if not c:
        # Jeśli brak danych, zwracamy pusty obiekt domyślny
        return CompanyOut(id=0, name=None, nip=None, address=None)
    return c


# Aktualizacja danych firmy
@router.patch("/", response_model=CompanyOut)
def update_company(payload: CompanyUpdate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    c = db.query(Company).first()
    if not c:
        c = Company()
        db.add(c)

    # Aktualizacja pól, jeśli zostały przekazane
    if payload.name is not None:
        c.name = payload.name
    if payload.nip is not None:
        c.nip = payload.nip
    if payload.address is not None:
        c.address = payload.address
    if payload.phone is not None:
        c.phone = payload.phone
    if payload.email is not None:
        c.email = payload.email

    db.commit()
    db.refresh(c)

    # Logowanie zmiany danych firmy
    write_log(
        db,
        user_id=current_user.id,
        action="COMPANY_UPDATE",
        resource="company",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"company_id": c.id}
    )

    return c
