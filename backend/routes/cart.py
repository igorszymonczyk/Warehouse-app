from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from models.users import User
from models.product import Product
from models.cart import Cart, CartItem
from schemas.cart import CartAddItem, CartUpdateItem, CartOut, CartItemOut

router = APIRouter(prefix="/cart", tags=["Cart"])

def _ensure_client(user: User):
    # pozwalamy każdemu zalogowanemu (CLIENT/ADMIN/SALESMAN) używać koszyka
    if not user or not user.id:
        raise HTTPException(status_code=401, detail="Unauthorized")

def _get_open_cart(db: Session, user_id: int) -> Cart:
    cart = db.query(Cart).filter(Cart.user_id == user_id, Cart.status == "open").first()
    if not cart:
        cart = Cart(user_id=user_id, status="open")
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart

def _cart_to_out(cart: Cart) -> CartOut:
    items_out = []
    total = 0.0
    for it in cart.items:
        name = it.product.name if it.product else ""
        line_total = it.qty * it.unit_price_snapshot
        total += line_total
        items_out.append(CartItemOut(
            id=it.id,
            product_id=it.product_id,
            name=name,
            qty=it.qty,
            unit_price=it.unit_price_snapshot,
            line_total=line_total
        ))
    return CartOut(items=items_out, total=round(total, 2))

@router.get("", response_model=CartOut)
def get_cart(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _ensure_client(current_user)
    cart = _get_open_cart(db, current_user.id)
    out = _cart_to_out(cart)

    write_log(
        db,
        user_id=current_user.id,
        action="CART_VIEW",
        resource="cart",
        status="SUCCESS",
        ip=request.client.host,
        meta={"items": len(out.items), "total": out.total},
    )
    return out

@router.post("/add", response_model=CartOut, status_code=status.HTTP_200_OK)
def add_to_cart(
    payload: CartAddItem,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _ensure_client(current_user)
    cart = _get_open_cart(db, current_user.id)

    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Na tym etapie nie zdejmujemy stanu magazynowego – tylko walidujemy, że jest dostępny
    if product.stock_quantity is not None and payload.qty > product.stock_quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id, CartItem.product_id == payload.product_id
    ).first()

    if item:
        item.qty += payload.qty
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=product.id,
            qty=payload.qty,
            unit_price_snapshot=product.sell_price_net,
        )
        db.add(item)

    db.commit()
    db.refresh(cart)

    out = _cart_to_out(cart)
    write_log(
        db,
        user_id=current_user.id,
        action="CART_ADD",
        resource="cart",
        status="SUCCESS",
        ip=request.client.host,
        meta={"product_id": product.id, "qty": payload.qty, "cart_items": len(out.items), "total": out.total},
    )
    return out

@router.put("/items/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    payload: CartUpdateItem,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _ensure_client(current_user)
    cart = _get_open_cart(db, current_user.id)

    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.cart_id == cart.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    product = db.query(Product).filter(Product.id == item.product_id).first()
    if product and product.stock_quantity is not None and payload.qty > product.stock_quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    item.qty = payload.qty
    db.commit()
    db.refresh(cart)

    out = _cart_to_out(cart)
    write_log(
        db,
        user_id=current_user.id,
        action="CART_UPDATE",
        resource="cart",
        status="SUCCESS",
        ip=request.client.host,
        meta={"item_id": item_id, "qty": payload.qty, "total": out.total},
    )
    return out

@router.delete("/items/{item_id}", response_model=CartOut)
def delete_cart_item(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _ensure_client(current_user)
    cart = _get_open_cart(db, current_user.id)

    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.cart_id == cart.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    db.delete(item)
    db.commit()
    db.refresh(cart)

    out = _cart_to_out(cart)
    write_log(
        db,
        user_id=current_user.id,
        action="CART_DELETE",
        resource="cart",
        status="SUCCESS",
        ip=request.client.host,
        meta={"item_id": item_id, "cart_items": len(out.items), "total": out.total},
    )
    return out
