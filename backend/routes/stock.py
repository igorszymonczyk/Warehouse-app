# backend/routes/stock.py
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Optional, List

from database import get_db
from models.stock import StockMovement
from models.product import Product
from models.users import User
from utils.tokenJWT import get_current_user
from utils.audit import write_log
import schemas.stock as stock_schemas

router = APIRouter(tags=["Stock"])

def _can_manage_stock(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "WAREHOUSE"}

# =========================
# LISTA RUCHÓW
# =========================
@router.get("/", response_model=stock_schemas.StockMovementPage)
def list_movements(
    request: Request,
    q: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None), # Nowy filtr
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: str = "created_at",
    order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(StockMovement).join(Product).join(User)

    if q:
        like = f"%{q}%"
        query = query.filter((Product.name.ilike(like)) | (Product.code.ilike(like)))
    if type:
        query = query.filter(StockMovement.type == type)
    if supplier:
        query = query.filter(StockMovement.supplier.ilike(f"%{supplier}%"))

    col = StockMovement.created_at if sort_by == "created_at" else StockMovement.id
    if order == "desc":
        query = query.order_by(col.desc())
    else:
        query = query.order_by(col.asc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for m in items:
        raw_type = (m.type or "").upper()
        if raw_type == "ADJUST": raw_type = "ADJUSTMENT"
        
        results.append({
            "id": m.id,
            "created_at": m.created_at,
            "product_id": m.product_id,
            "qty": m.qty,             
            "quantity_change": m.qty, 
            "reason": m.reason,
            "type": raw_type,
            "supplier": m.supplier, # Przekazujemy dostawcę
            "user_id": m.user_id,
            "product_name": m.product.name if m.product else "Nieznany",
            "product_code": m.product.code if m.product else "-",
            "user_email": m.user.email if m.user else "System"
        })

    return {"items": results, "total": total, "page": page, "page_size": page_size}


# =========================
# ZGŁOSZENIE STRATY / KOREKTY
# =========================
@router.post("/adjust", response_model=stock_schemas.StockMovementResponse)
def adjust_stock(
    payload: stock_schemas.StockMovementCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    qty_delta = payload.qty 
    new_quantity = product.stock_quantity + qty_delta
    
    # Jeśli to strata, nie pozwól na ujemny stan
    if qty_delta < 0 and new_quantity < 0:
        raise HTTPException(status_code=400, detail=f"Stan nie może być ujemny (Obecnie: {product.stock_quantity})")

    product.stock_quantity = new_quantity
    
    movement = StockMovement(
        product_id=product.id, 
        user_id=current_user.id,
        qty=qty_delta,      
        reason=payload.reason, 
        type=payload.type,
        supplier=payload.supplier 
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)

    write_log(db, user_id=current_user.id, action="STOCK_ADJUSTMENT", resource="stock", status="SUCCESS", meta={"product_id": product.id, "change": qty_delta})

    return {
        "id": movement.id, "created_at": movement.created_at,
        "product_id": movement.product_id, 
        "qty": movement.qty, "quantity_change": movement.qty,
        "reason": movement.reason, "type": movement.type, "supplier": movement.supplier,
        "user_id": movement.user_id, "product_name": product.name, "product_code": product.code, "user_email": current_user.email
    }


# =========================
# DOSTAWA
# =========================
@router.post("/delivery", response_model=dict)
def receive_delivery(
    payload: stock_schemas.DeliveryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_stock(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Brak produktów")

    count = 0
    for item in payload.items:
        if item.quantity <= 0: continue
        
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            product.stock_quantity += item.quantity
            
            move = StockMovement(
                product_id=product.id,
                user_id=current_user.id,
                qty=item.quantity,
                type="IN",
                reason=payload.reason or "Dostawa",
                supplier=payload.supplier # Zapisujemy dostawcę
            )
            db.add(move)
            count += 1
            
    db.commit()
    write_log(db, user_id=current_user.id, action="STOCK_DELIVERY", resource="stock", status="SUCCESS", meta={"count": count})
    return {"message": f"Pomyślnie przyjęto dostawę ({count} pozycji)"}