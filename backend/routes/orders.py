# backend/routes/orders.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session, joinedload
import json
import httpx

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

router = APIRouter(prefix="/orders", tags=["Orders"])
logger = logging.getLogger(__name__)


def _is_admin_or_sales(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN"}


def _cart_open(db: Session, user_id: int) -> Cart:
    return db.query(Cart).filter(Cart.user_id == user_id, Cart.status == "open").first()


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
    db.refresh(order)
    for item in order.items:
        db.refresh(item)

    # 1. ZDJĘCIE STANU MAGAZYNOWEGO
    for item in order.items:
        product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
        if product:
            product.stock_quantity -= item.qty

    # 2. TWORZENIE FAKTURY i WZ
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

    full_buyer_address = f"{order.invoice_address_street}, {order.invoice_address_zip} {order.invoice_address_city}"
    invoice = Invoice(
        user_id=order.user_id, order_id=order.id, payment_status=PaymentStatus.PAID,
        buyer_name=order.invoice_buyer_name, buyer_nip=order.invoice_buyer_nip,
        buyer_address=full_buyer_address, created_by=order.user_id,
        total_net=total_net, total_vat=total_vat, total_gross=total_gross, items=invoice_items
    )
    db.add(invoice)
    db.flush()

    warehouse_doc = WarehouseDocument(
        invoice_id=invoice.id, buyer_name=invoice.buyer_name, invoice_date=invoice.created_at,
        items_json=json.dumps(wz_items_json), status=WarehouseStatus.NEW
    )
    db.add(warehouse_doc)

    write_log(
        db, user_id=order.user_id, action="ORDER_FULFILL_AFTER_PAYMENT", resource="orders", status="SUCCESS",
        ip=request.client.host,
        meta={"order_id": order.id, "invoice_id": invoice.id, "wz_id": warehouse_doc.id}
    )


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

    product_cache, total_gross = {}, 0.0
    for ci in cart.items:
        prod = db.query(Product).filter(Product.id == ci.product_id).first()
        if not prod or prod.stock_quantity < ci.qty:
            raise HTTPException(status_code=400, detail=f"Brak stanu dla: {prod.name if prod else 'Brak produktu'}")
        product_cache[ci.product_id] = prod
        total_gross += ci.qty * ci.unit_price_snapshot * (1 + prod.tax_rate / 100)

    order = Order(
        user_id=current_user.id, status="pending_payment",
        total_amount=round(total_gross, 2), **payload.model_dump()
    )
    db.add(order)
    
    order_items = [OrderItem(
        order=order, product_id=ci.product_id, qty=ci.qty, unit_price=ci.unit_price_snapshot
    ) for ci in cart.items]
    db.add_all(order_items)

    cart.status = "ordered"
    db.commit()
    db.refresh(order)

    payu_products = [{
        "name": product_cache[it.product_id].name,
        "quantity": int(it.qty) if it.qty.is_integer() else it.qty,
        "unitPrice": int(round(it.unit_price * (1 + product_cache[it.product_id].tax_rate / 100), 2) * 100)
    } for it in order.items]
    
    payu_order_data = {
        "notifyUrl": payu_client.notify_url,
        "continueUrl": payu_client.continue_url,
        "customerIp": request.client.host,
        "merchantPosId": settings.PAYU_POS_ID,
        "description": f"Zamówienie #{order.id}",
        "currencyCode": "PLN",
        "totalAmount": int(order.total_amount * 100),
        "extOrderId": str(order.id),
        "buyer": {
            "email": current_user.email,
            "firstName": payload.invoice_contact_person.split(' ')[0],
            "lastName": " ".join(payload.invoice_contact_person.split(' ')[1:]),
            "language": "pl"
        },
        "products": payu_products
    }

    # Immediately fulfill the order and mark as paid/processing when user clicks "Pay",
    # then create PayU order and return redirect URL so user is redirected to PayU.
    try:
        order.status = "processing"
        try:
            _fulfill_order(db, order, request)
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to fulfill order after payment: {e}")

        # Now create PayU order to obtain redirect URL for the user
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
            # Payment initiation failed, but fulfillment already happened. Inform frontend.
            raise HTTPException(status_code=500, detail=f"Błąd komunikacji z systemem płatności: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in initiate_payment: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=OrdersPage)
def list_my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Synchronize order status with WarehouseDocument status if needed
    orders = db.query(Order).filter(Order.user_id == current_user.id).all()
    for order in orders:
        # Find related invoice and warehouse document
        invoice = db.query(Invoice).filter(Invoice.order_id == order.id).first()
        if invoice:
            wz = db.query(WarehouseDocument).filter(WarehouseDocument.invoice_id == invoice.id).first()
            if wz:
                # If WZ is released, set order status to shipped
                if wz.status == "RELEASED" and order.status != "shipped":
                    order.status = "shipped"
                    db.commit()
                # If WZ is cancelled, set order status to cancelled
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
    
    # Prosta walidacja, można rozbudować
    if old_status == "shipped" or old_status == "cancelled":
        raise HTTPException(status_code=400, detail=f"Cannot change status from {old_status}")

    # Logika anulowania zamówienia przedpłaconego jest skomplikowana (zwrot środków)
    # Na razie pozwalamy tylko na anulowanie przed wysyłką, bez automatycznego zwrotu stanu
    if new_status == "cancelled" and old_status in ("pending_payment", "processing"):
        # TODO: Implement refund logic via PayU API if needed
        pass

    order.status = new_status
    db.commit()
    write_log(db, user_id=current_user.id, action="ORDER_STATUS_CHANGE", resource="orders", status="SUCCESS",
        ip=request.client.host, meta={"order_id": order.id, "old": old_status, "new": new_status})

    db.refresh(order)
    order_with_relations = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order.id).first()
    
    return _order_to_out(order_with_relations)