from fastapi import Request
from sqlalchemy.orm import Session
from models.log import Log

def get_client_ip(request: Request) -> str:
    """
    Pobiera prawdziwe IP klienta, sprawdzając nagłówek X-Forwarded-For 
    (używany przez Azure Container Apps), a w razie braku bierze IP bezpośrednie.
    """
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # Nagłówek może zawierać listę, np. "203.0.113.195, 100.100.0.1"
        # Prawdziwe IP klienta jest zawsze pierwsze.
        return x_forwarded_for.split(",")[0].strip()
    
    # Fallback dla środowiska lokalnego (localhost)
    return request.client.host or "0.0.0.0"

def write_log(db: Session, *, user_id, action, resource, status="SUCCESS", ip=None, meta=None):
    entry = Log(user_id=user_id, action=action, resource=resource, status=status, ip=ip, meta=meta or {})
    db.add(entry)
    db.commit()