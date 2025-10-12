# routes/logs.py
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models.log import Log
from utils.tokenJWT import role_required

router = APIRouter(prefix="/logs", tags=["Logs"])

@router.get("", dependencies=[Depends(role_required("ADMIN"))])
def list_logs(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    page: int = 1,
    page_size: int = 50,
):
    q = db.query(Log)
    if user_id is not None:
        q = q.filter(Log.user_id == user_id)
    if action:
        q = q.filter(Log.action == action)
    if resource:
        q = q.filter(Log.resource == resource)
    if status:
        q = q.filter(Log.status == status)
    if from_:
        q = q.filter(Log.ts >= from_)
    if to:
        q = q.filter(Log.ts <= to)

    total = q.count()
    items = q.order_by(Log.ts.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}
