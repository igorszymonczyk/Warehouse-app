from sqlalchemy.orm import Session
from models.log import Log

def write_log(db: Session, *, user_id, action, resource, status="SUCCESS", ip=None, meta=None):
    entry = Log(user_id=user_id, action=action, resource=resource, status=status, ip=ip, meta=meta or {})
    db.add(entry)
    db.commit()
