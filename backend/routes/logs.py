# backend/routes/logs.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models.log import Log
from models.users import User
from utils.tokenJWT import get_current_user

router = APIRouter(prefix="/logs", tags=["Logs"])

# --- SCHEMATY ---
class LogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource: str
    status: str
    ip: Optional[str] = None
    ts: datetime 
    meta: Optional[Any] = None

    class Config:
        from_attributes = True

class LogPage(BaseModel):
    items: List[LogResponse]
    total: int
    page: int
    page_size: int

# --- ENDPOINT ---
@router.get("", response_model=LogPage)
def get_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    # --- NOWE FILTRY ---
    action: Optional[str] = Query(None, description="Filtruj po akcji"),
    user_id: Optional[int] = Query(None, description="Filtruj po ID użytkownika"),
    resource: Optional[str] = Query(None, description="Filtruj po zasobie"),
    status: Optional[str] = Query(None, description="Filtruj po statusie (SUCCESS/FAIL)"),
    date_from: Optional[str] = Query(None, description="Data od (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Data do (YYYY-MM-DD)"),
    # -------------------
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Tylko administrator może przeglądać logi.")

    query = db.query(Log)

    # 1. Filtr Akcji
    if action:
        query = query.filter(Log.action.ilike(f"%{action}%"))

    # 2. Filtr User ID
    if user_id is not None:
        query = query.filter(Log.user_id == user_id)

    # 3. Filtr Zasobu
    if resource:
        query = query.filter(Log.resource.ilike(f"%{resource}%"))

    # 4. Filtr Statusu
    if status:
        query = query.filter(Log.status == status)

    # 5. Filtry Daty
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.filter(Log.ts >= dt_from)
        except ValueError:
            pass # Ignorujemy błędny format

    if date_to:
        try:
            # Dodajemy czas 23:59:59, aby objąć cały dzień końcowy
            dt_to_str = date_to
            if len(dt_to_str) == 10: # Format YYYY-MM-DD
                dt_to_str += " 23:59:59"
            
            dt_to = datetime.fromisoformat(dt_to_str)
            query = query.filter(Log.ts <= dt_to)
        except ValueError:
            pass

    # Sortowanie po dacie (malejąco)
    query = query.order_by(Log.ts.desc())

    total = query.count()
    logs = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    }