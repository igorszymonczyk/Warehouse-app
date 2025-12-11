# backend/routes/orders.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session, joinedload
import json
import httpx
import time
from datetime import datetime

from database import get_db
import logging
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from utils.payu_client import payu_client
from config import settings
from models.users import User
from models.product import Product
from models.cart import Cart, CartItem
from models.order import Order, OrderItem
from models.invoice import Invoice, InvoiceItem, PaymentStatus
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from schemas.order import (
    OrderResponse, OrdersPage, OrderStatusPatch, OrderItemOut,
    OrderCreatePayload, PaymentInitiationResponse
)
from sqlalchemy import func 

router = APIRouter(prefix="/orders", tags=["Orders"])
logger = logging.getLogger(__name__)

# Check permissions for Admin or Salesman roles
def _is_admin_or_sales(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN"}

# Retrieve the user's active open cart
def _cart_open(db: Session, user_id: int) -> Cart:
    return db.query(Cart).filter(Cart.user_id == user_id, Cart.status == "open").first()

# Map Order model to OrderResponse schema
def _order_to_out(order: Order) -> OrderResponse:
    items: List[OrderItemOut] = []
    for it in order.items:
        product_name = it.product.name if it.product else "Usunięty produkt"
        items.append(OrderItemOut(
            product_id=it.product_id,
            product_name=product_name,
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

def _fulfill_order(db: Session, order: Order, request: Request):
    """
    Executes order fulfillment: stock deduction, invoice generation, and WZ document creation.
    """
    db.refresh(order)
    for item in order.items:
        db.refresh(item)

    # 1. Deduct stock quantity
    for item in order.items:
        product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
        if product:
            product.stock_quantity -= item.qty

    # 2. Calculate totals and prepare Invoice/WZ items
    total_net, total_vat, total_gross = 0.0, 0.0, 0.0
    invoice_items, wz_items_json = [], []

    for item in order.items:
        prod = item.product
        if not prod: continue

        price_net = item.unit_price
        tax_rate, quantity = prod.tax_rate, item.qty
        total_item_net = price_net * quantity
        total_item_gross = total_item_net * (1 + tax_rate / 100)
        
        total_net += total_item_net
        total_vat += (total_item_gross - total_item_net)
        total_gross += total_item_gross

        invoice_items.append(InvoiceItem(
            product_id=prod.id, product_name=prod.name, quantity=quantity, price_net=price_net,
            tax_rate=tax_rate, total_net=total_item_net, total_gross=total_item_gross
        ))
        wz_items_json.append({
            "product_name": prod.name, "product_code": prod.code,
            "quantity": quantity, "location": prod.location or ""
        })

    # Address formatting
    billing_addr = f"{order.invoice_address_street}, {order.invoice_address_zip} {order.invoice_address_city}"
    
    shipping_addr = None
    if order.shipping_address_street:
        shipping_addr = f"{order.shipping_address_street}, {order.shipping_address_zip} {order.shipping_address_city}"
    else:
        shipping_addr = billing_addr

    # Generate sequential invoice number
    last_number = db.query(func.max(Invoice.number)).filter(
        (Invoice.is_correction == False) | (Invoice.is_correction == None)
    ).scalar()
    new_number = (last_number or 0) + 1

    # Common creation timestamp
    now = datetime.now()

    # Create Invoice record
    invoice = Invoice(
        user_id=order.user_id, order_id=order.id, payment_status=PaymentStatus.PAID,
        buyer_name=order.invoice_buyer_name, buyer_nip=order.invoice_buyer_nip,
        buyer_address=billing_addr,    
        shipping_address=shipping_addr, 
        created_by=order.user_id,
        created_at=now, 
        total_net=total_net, total_vat=total_vat, total_gross=total_gross, items=invoice_items,
        number=new_number
    )
    db.add(invoice)
    db.flush()

    # Create Warehouse Document (WZ)
    warehouse_doc = WarehouseDocument(
        invoice_id=invoice.id, 
        buyer_name=invoice.buyer_name, 
        invoice_date=now, 
        created_at=now,   
        items_json=json.dumps(wz_items_json), 
        status=WarehouseStatus.NEW,
        shipping_address=shipping_addr 
    )
    db.add(warehouse_doc)

    write_log(
        db, user_id=order.user_id, action="ORDER_FULFILL_AFTER_PAYMENT", resource="orders", status="SUCCESS",
        ip=request.client.host,
        meta={"order_id": order.id, "invoice_id": invoice.id, "wz_id": warehouse_doc.id}
    )

# Initiate payment process, create order, and trigger fulfillment
@router.post("/initiate-payment", response_model=PaymentInitiationResponse)
async def initiate_payment(
    payload: OrderCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cart = _cart_open(db, current_user.id)
    if not cart or not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Validate stock and calculate total
    product_cache, total_gross = {}, 0.0
    for ci in cart.items:
        prod = db.query(Product).filter(Product.id == ci.product_id).first()
        if not prod or prod.stock_quantity < ci.qty:
            raise HTTPException(status_code=400, detail=f"Brak stanu dla: {prod.name if prod else 'Brak produktu'}")
        product_cache[ci.product_id] = prod
        total_gross += ci.qty * ci.unit_price_snapshot * (1 + prod.tax_rate / 100)

    # Prepare order data
    order_data = payload.model_dump()
    if not order_data.get("shipping_address_street"):
        order_data["shipping_address_street"] = order_data["invoice_address_street"]
        order_data["shipping_address_zip"] = order_data["invoice_address_zip"]
        order_data["shipping_address_city"] = order_data["invoice_address_city"]

    if "invoice_contact_person" in order_data:
        del order_data["invoice_contact_person"]

    order = Order(
        user_id=current_user.id, status="pending_payment",
        total_amount=round(total_gross, 2), 
        **order_data 
    )
    db.add(order)
    
    # Move cart items to order items
    order_items = [OrderItem(
        order=order, product_id=ci.product_id, qty=ci.qty, unit_price=ci.unit_price_snapshot
    ) for ci in cart.items]
    db.add_all(order_items)

    cart.status = "ordered"
    db.commit()
    db.refresh(order)

    # Prepare PayU request data
    payu_products = [{
        "name": product_cache[it.product_id].name,
        "quantity": int(it.qty) if it.qty.is_integer() else it.qty,
        "unitPrice": int(round(it.unit_price * (1 + product_cache[it.product_id].tax_rate / 100), 2) * 100)
    } for it in order.items]
    
    unique_ext_order_id = f"{order.id}_{int(time.time())}"
    
    buyer_first_name = getattr(current_user, "first_name", "") or "Klient"
    buyer_last_name = getattr(current_user, "last_name", "") or "Sklepu"
    if (not buyer_first_name or buyer_first_name == "Klient") and payload.invoice_buyer_name:
         parts = payload.invoice_buyer_name.split(' ')
         buyer_first_name = parts[0]
         buyer_last_name = " ".join(parts[1:]) if len(parts) > 1 else "-"

    payu_order_data = {
        "notifyUrl": payu_client.notify_url,
        "continueUrl": payu_client.continue_url,
        "customerIp": request.client.host,
        "merchantPosId": settings.PAYU_POS_ID,
        "description": f"Zamówienie #{order.id}",
        "currencyCode": "PLN",
        "totalAmount": int(order.total_amount * 100),
        "extOrderId": unique_ext_order_id, 
        "buyer": {
            "email": current_user.email,
            "firstName": buyer_first_name,
            "lastName": buyer_last_name,
            "language": "pl"
        },
        "products": payu_products
    }

    # Attempt immediate order fulfillment (Invoice/WZ creation)
    try:
        order.status = "processing"
        _fulfill_order(db, order, request)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to fulfill order immediately: {e}")
        raise HTTPException(status_code=500, detail=f"Błąd generowania faktury: {e}")
    
    # Call PayU API
    try:
        token = await payu_client.get_auth_token()
        payu_response = await payu_client.create_order(token, payu_order_data)

        redirect = None
        if isinstance(payu_response, dict):
            redirect = payu_response.get("redirectUri") or payu_response.get("redirect_uri") or payu_response.get("redirectUrl") or payu_response.get("Location") or payu_response.get("location")
            order.payu_order_id = payu_response.get("orderId") or payu_response.get("order_id")

        order.payment_url = redirect
        db.commit()

        return PaymentInitiationResponse(redirect_url=redirect, order_id=order.id)
    except httpx.HTTPError as e:
        logger.exception("PayU create order failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Błąd komunikacji z systemem płatności: {e}")
    except Exception as e:
        logger.exception("Unexpected error in initiate_payment: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# List user orders, syncing status with warehouse documents
@router.get("", response_model=OrdersPage)
def list_my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    orders = db.query(Order).filter(Order.user_id == current_user.id).all()
    for order in orders:
        invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
        if invoice:
            wz = db.query(WarehouseDocument).filter(WarehouseDocument.invoice_id == invoice.id).first()
            if wz:
                if wz.status == "RELEASED" and order.status != "shipped":
                    order.status = "shipped"
                    db.commit()
                elif wz.status == "CANCELLED" and order.status != "cancelled":
                    order.status = "cancelled"
                    db.commit()
    q = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.user_id == current_user.id).order_by(Order.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    items = [_order_to_out(o) for o in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# Get details of a specific order
@router.get("/{order_id}", response_model=OrderResponse)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    o = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()
    
    if not o or (o.user_id != current_user.id and not _is_admin_or_sales(current_user)):
        raise HTTPException(status_code=404, detail="Order not found or forbidden")
    return _order_to_out(o)


# Manually update order status (Admin/Sales only)
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

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status, new_status = order.status, payload.status
    
    if old_status == "shipped" or old_status == "cancelled":
        raise HTTPException(status_code=400, detail=f"Cannot change status from {old_status}")

    order.status = new_status
    db.commit()
    write_log(db, user_id=current_user.id, action="ORDER_STATUS_CHANGE", resource="orders", status="SUCCESS",
        ip=request.client.host, meta={"order_id": order.id, "old": old_status, "new": new_status})

    db.refresh(order)
    order_with_relations = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order.id).first()
    
    return _order_to_out(order_with_relations)