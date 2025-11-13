from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session, joinedload
import json # Import do WZ

from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
from models.cart import Cart, CartItem
from models.order import Order, OrderItem
# 1. ZMIANA: Importujemy modele Faktury i WZ
from models.invoice import Invoice, InvoiceItem, PaymentStatus
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus

from schemas.order import OrderResponse, OrdersPage, OrderStatusPatch, OrderItemOut, OrderCreatePayload

router = APIRouter(prefix="/orders", tags=["Orders"])

def _is_admin_or_sales(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "SALESMAN"}

def _cart_open(db: Session, user_id: int) -> Cart:
    return db.query(Cart).filter(Cart.user_id == user_id, Cart.status == "open").first()

def _order_to_out(order: Order) -> OrderResponse:
    # ... (ta funkcja bez zmian) ...
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

#
# 2. ZMIANA: Całkowicie nowa funkcja create_order
#
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

    # --- 1. Walidacja stanów magazynowych (zanim cokolwiek zrobimy) ---
    product_cache = {} # Szybka pamięć podręczna dla produktów
    for ci in cart.items:
        prod = db.query(Product).filter(Product.id == ci.product_id).with_for_update().first()
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produkt ID {ci.product_id} nie znaleziony")
        if prod.stock_quantity < ci.qty:
            raise HTTPException(
                status_code=400,
                detail=f"Brak wystarczającego stanu dla produktu: {prod.name}"
            )
        product_cache[ci.product_id] = prod

    # --- 2. Stworzenie Zamówienia (Order) ---
    order = Order(
        user_id=current_user.id,
        status="processing", # Ustawiamy "w trakcie realizacji", bo faktura od razu powstaje
        total_amount=0.0, # Obliczymy to za chwilę
        **payload.model_dump() # Zapisz dane adresowe w zamówieniu
    )
    db.add(order)
    db.flush()  # Potrzebujemy order.id dla faktury

    total_net = 0.0
    total_vat = 0.0
    total_gross = 0.0
    invoice_items = []
    wz_items_json = []

    # --- 3. Pętla tworząca pozycje Zamówienia (OrderItem) i Faktury (InvoiceItem) ---
    for ci in cart.items:
        prod = product_cache[ci.product_id] # Pobieramy produkt z pamię podręcznej

        # Obliczenia kwot
        price_net = ci.unit_price_snapshot
        tax_rate = prod.tax_rate
        quantity = ci.qty
        
        total_item_net = price_net * quantity
        total_item_gross = total_item_net * (1 + tax_rate / 100)
        vat_value = total_item_gross - total_item_net

        total_net += total_item_net
        total_vat += vat_value
        total_gross += total_item_gross

        # A. Pozycja zamówienia
        oi = OrderItem(
            order_id=order.id,
            product_id=ci.product_id,
            qty=quantity,
            unit_price=price_net
        )
        db.add(oi)
        
        # B. Pozycja faktury
        invoice_items.append(
            InvoiceItem(
                product_id=prod.id,
                quantity=quantity,
                price_net=price_net,
                tax_rate=tax_rate,
                total_net=total_item_net,
                total_gross=total_item_gross,
            )
        )
        
        # C. Pozycja WZ (jako dict dla JSON)
        wz_items_json.append({
            "product_name": prod.name,
            "product_code": prod.code,
            "quantity": quantity,
            "location": prod.location or "",
        })
        
        # D. OSTATECZNE ZDJĘCIE STANU MAGAZYNOWEGO
        # Robimy to tylko raz, tutaj!
        prod.stock_quantity -= quantity

    # Uzupełniamy kwotę w zamówieniu
    order.total_amount = total_gross 

    # --- 4. Stworzenie Faktury (Invoice) ---
    full_buyer_address = f"{payload.invoice_address_street}, {payload.invoice_address_zip} {payload.invoice_address_city}"
    
    invoice = Invoice(
        user_id=current_user.id,
        order_id=order.id,
        payment_status=PaymentStatus.PENDING,
        buyer_name=payload.invoice_buyer_name,
        buyer_nip=payload.invoice_buyer_nip,
        buyer_address=full_buyer_address,
        created_by=current_user.id,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        items=invoice_items, # Przypisujemy pozycje faktury
    )
    db.add(invoice)
    db.flush() # Potrzebujemy invoice.id dla WZ

    # --- 5. Stworzenie WZ (WarehouseDocument) ---
    warehouse_doc = WarehouseDocument(
        invoice_id=invoice.id, # Kluczowe powiązanie!
        buyer_name=invoice.buyer_name, # Bierzemy dane z faktury
        invoice_date=invoice.created_at,
        items_json=json.dumps(wz_items_json),
        status=WarehouseStatus.NEW # Gotowe dla magazyniera
    )
    db.add(warehouse_doc)

    # --- 6. Zakończenie transakcji ---
    cart.status = "ordered" # Zamykamy koszyk
    
    try:
        db.commit() # Zapisujemy wszystko (Order, Invoice, WZ, zmiany stanów)
    except Exception as e:
        db.rollback()
        print(f"BŁĄD TRANSAKCJI: {e}")
        raise HTTPException(status_code=500, detail="Nie udało się przetworzyć zamówienia z powodu błędu serwera.")

    db.refresh(order) # Odświeżamy zamówienie

    # --- 7. Logowanie ---
    write_log(
        db,
        user_id=current_user.id,
        action="ORDER_CREATE_WITH_INVOICE",
        resource="orders",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "order_id": order.id, 
            "invoice_id": invoice.id, 
            "wz_id": warehouse_doc.id,
            "total_gross": total_gross
        }
    )
    
    # Przeładowujemy zamówienie z relacjami do odpowiedzi
    order_with_relations = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order.id).first()

    return _order_to_out(order_with_relations)


# ... (reszta pliku: list_my_orders, get_order_detail, update_order_status - bez zmian) ...

@router.get("", response_model=OrdersPage)
def list_my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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

    o = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == order_id).first()
    
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")

    old = o.status
    new = payload.status

    allowed = {
        "pending": ["processing", "cancelled"],
        "processing": ["shipped", "cancelled"],
        "shipped": [],
        "cancelled": [],
    }
    if new not in allowed.get(old, []):
        raise HTTPException(status_code=400, detail=f"Invalid transition {old} → {new}")

    if new == "cancelled" and old in ("pending", "processing"):
        # UWAGA: Ta logika teraz jest bardziej skomplikowana.
        # Jeśli anulujemy zamówienie, powinniśmy też anulować WZ i ewentualnie fakturę.
        # Na razie zostawmy zwrot stanów.
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
    
    db.refresh(o) 
    order_with_relations = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product)
    ).filter(Order.id == o.id).first()
    
    return _order_to_out(order_with_relations)