# backend/routes/logs.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models.log import Log  # Model z kolumną 'ts'
from models.users import User
from utils.tokenJWT import get_current_user

router = APIRouter(prefix="/logs", tags=["Logs"])

# --- SCHEMATY (Tylko do odczytu) ---
class LogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource: str
    status: str
    ip_address: Optional[str] = None
    # ZMIANA: Używamy 'ts' do odczytu daty
    ts: datetime 
    meta: Optional[Any] = None # JSON field

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
    action: Optional[str] = Query(None, description="Filtruj po akcji"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Tylko Admin ma dostęp
    if (current_user.role or "").upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Tylko administrator może przeglądać logi.")

    # 2. Budowanie zapytania
    query = db.query(Log)

    if action:
        query = query.filter(Log.action.ilike(f"%{action}%"))

    # 3. ZMIANA: Sortowanie po polu 'ts' (zamiast 'timestamp')
    query = query.order_by(Log.ts.desc())

    # 4. Paginacja
    total = query.count()
    logs = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    }