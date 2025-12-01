# backend/routes/payu.py
import hashlib
import json
import logging
from fastapi import APIRouter, Request, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from database import get_db
from config import settings
from models.order import Order
from routes.orders import _fulfill_order
from utils.audit import write_log

router = APIRouter(prefix="/payu", tags=["PayU"])
logger = logging.getLogger(__name__)

def verify_payu_signature(header_signature: str, request_body: bytes) -> bool:
    """Verifies the signature of a notification from PayU."""
    second_key = settings.PAYU_SECOND_KEY_MD5
    try:
        parts = {p.split('=')[0]: p.split('=')[1] for p in header_signature.split(';')}
        signature_from_header = parts.get('signature')
    except IndexError:
        return False
    
    if not signature_from_header:
        return False
        
    concatenated = request_body + second_key.encode('utf-8')
    expected_signature = hashlib.sha256(concatenated).hexdigest()
    
    return expected_signature == signature_from_header

@router.post("/notify")
async def payu_notify(
    request: Request,
    db: Session = Depends(get_db),
    openpayu_signature: str = Header(None, alias="OpenPayU-Signature")
):
    if openpayu_signature is None:
        raise HTTPException(status_code=400, detail="Missing OpenPayU-Signature header")

    body = await request.body()

    
    try:
        body_text = body.decode("utf-8")
    except Exception:
        body_text = str(body)

    logger.info("PayU notify received. header=%s, body_preview=%s", openpayu_signature, body_text[:1000])

    verified = verify_payu_signature(openpayu_signature, body)
    if not verified:
        try:
            parts = {p.split('=')[0]: p.split('=')[1] for p in openpayu_signature.split(';')}
            signature_from_header = parts.get('signature')
        except Exception:
            signature_from_header = None
        logger.warning("PayU signature verification failed. header_sig=%s", signature_from_header)
        raise HTTPException(status_code=403, detail="Signature verification failed")

    notification_data = json.loads(body)
    payu_order_status = notification_data.get("order", {}).get("status")
    
    if payu_order_status == "COMPLETED":
        ext_order_id_str = notification_data.get("order", {}).get("extOrderId")
        if not ext_order_id_str:
            return {"status": "error", "message": "Missing extOrderId"}

        # odcinamy _timestamp
        try:
            order_id = int(ext_order_id_str.split('_')[0])
        except ValueError:
            return {"status": "error", "message": "Invalid ID format"}

        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            return {"status": "error", "message": "Order not found"}
            
        # Jeśli status jest nadal pending, a PayU potwierdza, uruchamiamy realizację
        if order.status == "pending_payment":
            order.status = "processing"
            order.payment_status = "paid" 

            try:
             
                _fulfill_order(db, order, request)
                db.commit()

                # Write audit log
                try:
                    write_log(
                        db, user_id=order.user_id, action="PAYU_NOTIFY", resource="orders", status="SUCCESS",
                        ip=request.client.host if request.client else None,
                        meta={"order_id": order.id, "payu_status": payu_order_status}
                    )
                except Exception as log_e:
                    logger.exception("Failed to write audit log after PayU notify: %s", log_e)

            except Exception as e:
                db.rollback()
                logger.exception("CRITICAL: Failed to fulfill order %s after payment. Error: %s", order.id, e)
                raise HTTPException(status_code=500, detail="Failed to fulfill order after payment")
            
    return {"status": "ok"}