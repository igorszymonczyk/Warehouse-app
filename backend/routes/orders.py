# backend/routes/orders.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
from models.cart import Cart, CartItem
from models.order import Order, OrderItem
from schemas.order import OrderResponse, OrdersPage, OrderStatusPatch, OrderItemOut, OrderCreatePayload

router = APIRouter(prefix="/orders", tags=["Orders"])

def _is_admin_or_sales(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN"}

def _cart_open(db: Session, user_id: int) -> Cart:
    return db.query(Cart).filter(Cart.user_id == user_id, Cart.status == "open").first()

def _order_to_out(order: Order) -> OrderResponse:
    items: List[OrderItemOut] = []
    for it in order.items:
        items.append(OrderItemOut(
            product_id=it.product_id,
            qty=it.qty,
            unit_price=it.unit_price,
            line_total=round(it.qty * it.unit_price, 2)
        ))
    return OrderResponse(
        id=order.id,
        status=order.status,
        total_amount=round(order.total_amount, 2),
        created_at=order.created_at,
        items=items
    )

@router.post("/create", response_model=OrderResponse)
def create_order(
    payload: OrderCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = _cart_open(db, current_user.id)
    if not cart or not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # walidacja stanów przed zmianą
    for ci in cart.items:
        prod = db.query(Product).filter(Product.id == ci.product_id).with_for_update(read=False).first()
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product {ci.product_id} not found")
        if prod.stock_quantity is not None and ci.qty > prod.stock_quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for product {prod.id}")

    order = Order(
        user_id=current_user.id, 
        status="pending", 
        total_amount=0.0,
        **payload.model_dump()
    )
    db.add(order)
    db.flush()  # mamy order.id

    total = 0.0
    for ci in cart.items:
        oi = OrderItem(
            order_id=order.id,
            product_id=ci.product_id,
            qty=ci.qty,
            unit_price=ci.unit_price_snapshot
        )
        db.add(oi)
        total += ci.qty * ci.unit_price_snapshot

        # zdejmujemy stan
        prod = db.query(Product).filter(Product.id == ci.product_id).first()
        if prod and prod.stock_quantity is not None:
            prod.stock_quantity -= ci.qty
            if prod.stock_quantity < 0:
                prod.stock_quantity = 0  # safety

    order.total_amount = total
    # zamykamy koszyk
    cart.status = "ordered"

    db.commit()
    db.refresh(order)

    write_log(
        db,
        user_id=current_user.id,
        action="ORDER_CREATE",
        resource="orders",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"order_id": order.id, "total": order.total_amount}
    )

    return _order_to_out(order)

@router.get("", response_model=OrdersPage)
def list_my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(Order).filter(Order.user_id == current_user.id).order_by(Order.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    items = [_order_to_out(o) for o in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}

@router.get("/{order_id}", response_model=OrderResponse)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.user_id != current_user.id and not _is_admin_or_sales(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _order_to_out(o)

@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    payload: OrderStatusPatch,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not _is_admin_or_sales(current_user):
        raise HTTPException(status_code=403, detail="Forbidden")

    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")

    old = o.status
    new = payload.status

    # Dozwolone przejścia (dodano 'cancelled')
    allowed = {
        "pending": ["processing", "cancelled"],
        "processing": ["shipped", "cancelled"],
        "shipped": [],
        "cancelled": [],
    }
    if new not in allowed.get(old, []):
        raise HTTPException(status_code=400, detail=f"Invalid transition {old} → {new}")

    # Zwrot stanu przy anulowaniu (zakładamy, że przy create zdjęliśmy stock)
    if new == "cancelled" and old in ("pending", "processing"):
        for it in o.items:
            prod = db.query(Product).filter(Product.id == it.product_id).with_for_update(read=False).first()
            if not prod:
                continue
            prod.stock_quantity = (prod.stock_quantity or 0) + it.qty

    o.status = new
    db.commit()
    db.refresh(o)

    write_log(
        db,
        user_id=current_user.id,
        action="ORDER_STATUS",
        resource="orders",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"order_id": o.id, "old_status": old, "new_status": o.status}
    )
    return _order_to_out(o)
