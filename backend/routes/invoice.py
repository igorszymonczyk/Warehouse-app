from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session, joinedload
from models.invoice import Invoice, InvoiceItem
from models.product import Product
from models.WarehouseDoc import WarehouseDocument
from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from schemas import invoice as invoice_schemas
from utils.audit import write_log
from typing import Optional, Literal
from sqlalchemy import or_
import json
router = APIRouter(tags=["Invoices"])

@router.post("/invoices", response_model=invoice_schemas.InvoiceResponse)
def create_invoice(
    request: Request,
    invoice_data: invoice_schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --- autoryzacja ---
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to issue invoices")

    # --- obliczenia ---
    total_net = 0.0
    total_vat = 0.0
    total_gross = 0.0
    items = []

    for item_data in invoice_data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product ID {item_data.product_id} not found")

        # Sprawdzenie dostępności towaru
        if product.stock_quantity < item_data.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for product '{product.name}' (ID: {product.id})"
            )

        # można nadpisać cenę netto ręcznie
        price_net = item_data.price_net or product.sell_price_net
        tax_rate = item_data.tax_rate or product.tax_rate
        quantity = item_data.quantity

        total_item_net = price_net * quantity
        total_item_gross = total_item_net * (1 + tax_rate / 100)
        vat_value = total_item_gross - total_item_net

        total_net += total_item_net
        total_vat += vat_value
        total_gross += total_item_gross

        # tworzymy pozycję faktury
        items.append(
            InvoiceItem(
                product_id=product.id,
                quantity=quantity,
                price_net=price_net,
                tax_rate=tax_rate,
                total_net=total_item_net,
                total_gross=total_item_gross,
            )
        )

        # 🔹 aktualizacja stanu magazynowego
        product.stock_quantity -= quantity

    # --- zapis faktury ---
    invoice = Invoice(
        buyer_name=invoice_data.buyer_name,
        buyer_nip=invoice_data.buyer_nip,
        buyer_address=invoice_data.buyer_address,
        created_by=current_user.id,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        items=items,
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # ---UTWORZENIE FORMATKI MAGAZYNOWEJ
    warehouse_items = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        warehouse_items.append({
            "product_name": product.name,
            "product_code": product.code,
            "quantity": item.quantity,
            "location": product.location,
        })

    warehouse_doc = WarehouseDocument(
        invoice_id=invoice.id,
        buyer_name=invoice.buyer_name,
        invoice_date=invoice.created_at if hasattr(invoice, "created_at") else None,
        items_json=json.dumps(warehouse_items),
        status="NEW"
    )

    db.add(warehouse_doc)
    db.commit()
    db.refresh(warehouse_doc)

    # --- AUDYT ---
    write_log(
        db,
        user_id=current_user.id,
        action="INVOICE_CREATE",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "invoice_id": invoice.id,
            "total_gross": total_gross,
            "buyer": invoice_data.buyer_name,
            "warehouse_doc_id": warehouse_doc.id,
            "items": warehouse_items,
        },
    )

    return invoice



@router.get("/invoices/{invoice_id}", response_model=invoice_schemas.InvoiceDetail)
def get_invoice(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to view invoices")

    # łączenie bazy z produktami na fakturze
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice_id)
        .first()
    )

    if not invoice:
        write_log(
            db,
            user_id=current_user.id,
            action="INVOICE_GET",
            resource="invoices",
            status="FAIL",
            ip=request.client.host if request.client else None,
            meta={"invoice_id": invoice_id, "reason": "not_found"},
        )
        raise HTTPException(status_code=404, detail="Invoice not found")

    # konwersja danych produktów do czytelnego formatu
    detailed_items = []
    for item in invoice.items:
        detailed_items.append({
            "product_id": item.product_id,
            "product_name": item.product.name if item.product else None,
            "quantity": item.quantity,
            "price_net": item.price_net,
            "tax_rate": item.tax_rate,
            "total_net": item.total_net,
            "total_gross": item.total_gross,
        })

    # AUDYT (sukces)
    write_log(
        db,
        user_id=current_user.id,
        action="INVOICE_GET",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"invoice_id": invoice.id},
    )

    # zwracamy dane w formacie zgodnym ze schematem
    return {
        "id": invoice.id,
        "buyer_name": invoice.buyer_name,
        "buyer_nip": invoice.buyer_nip,
        "buyer_address": invoice.buyer_address,
        "created_at": invoice.created_at,
        "total_net": invoice.total_net,
        "total_vat": invoice.total_vat,
        "total_gross": invoice.total_gross,
        "items": detailed_items,
    }

@router.get("/invoices", response_model=invoice_schemas.InvoiceListPage)
def list_invoices(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po nazwie lub NIP klienta"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "buyer_name", "total_gross"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to view invoices")

    query = db.query(Invoice)

    # Wyszukiwanie po nazwie lub NIP
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Invoice.buyer_name.ilike(like),
                Invoice.buyer_nip.ilike(like),
            )
        )

    # Sortowanie
    sort_map = {
        "created_at": Invoice.created_at,
        "buyer_name": Invoice.buyer_name,
        "total_gross": Invoice.total_gross,
    }
    col = sort_map[sort_by]
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    # Paginacja
    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    # AUDYT
    write_log(
        db,
        user_id=current_user.id,
        action="INVOICES_LIST",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={
            "q": q,
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "order": order,
            "returned": len(invoices),
        },
    )

    return {
        "items": invoices,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
