# backend/routers/invoices.py

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional, Literal, List
from sqlalchemy import or_
from pathlib import Path
import json
from datetime import datetime

from models.invoice import Invoice, InvoiceItem
from models.product import Product
from models.WarehouseDoc import WarehouseDocument
from models.company import Company
from models.users import User
from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from schemas import invoice as invoice_schemas

# IMPORTY Z NOWEGO PLIKU UTILS (PDF)
from utils.pdf import generate_invoice_pdf, get_pdf_path

router = APIRouter(tags=["Invoices"])

# =========================
# HELPER: PERMISSIONS
# =========================

def _check_pdf_permission(db: Session, invoice_id: int, user: User) -> Invoice:
    """Sprawdza uprawnienia do faktury i zwraca obiekt Invoice."""
    invoice = db.query(Invoice).options(joinedload(Invoice.items)).filter(Invoice.id == invoice_id).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    is_admin_or_sales = (user.role or "").upper() in {"ADMIN", "SALESMAN"}
    is_owner = invoice.user_id == user.id

    if not is_admin_or_sales and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")
        
    return invoice

# =========================
# CREATE INVOICE
# =========================

@router.post("/invoices", response_model=invoice_schemas.InvoiceResponse)
def create_invoice(
    request: Request,
    invoice_data: invoice_schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to issue invoices")

    total_net, total_vat, total_gross = 0.0, 0.0, 0.0
    items = []

    for item_data in invoice_data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product ID {item_data.product_id} not found")
        if product.stock_quantity < item_data.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock for product '{product.name}'")

        price_net = item_data.price_net or product.sell_price_net
        tax_rate = item_data.tax_rate or product.tax_rate
        quantity = item_data.quantity

        total_item_net = price_net * quantity
        total_item_gross = total_item_net * (1 + tax_rate / 100)
        
        total_net += total_item_net
        total_vat += (total_item_gross - total_item_net)
        total_gross += total_item_gross

        items.append(
            InvoiceItem(
                product_id=product.id,
                product_name=product.name,
                quantity=quantity,
                price_net=price_net,
                tax_rate=tax_rate,
                total_net=total_item_net,
                total_gross=total_item_gross,
            )
        )
        product.stock_quantity -= quantity

    invoice = Invoice(
        buyer_name=invoice_data.buyer_name,
        buyer_nip=invoice_data.buyer_nip,
        buyer_address=invoice_data.buyer_address,
        created_by=current_user.id,
        user_id=current_user.id,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        items=items,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Automatyczne utworzenie dokumentu WZ
    warehouse_items = [
        {
            "product_name": item.product_name,
            "product_code": db.query(Product.code).filter(Product.id == item.product_id).scalar(),
            "quantity": item.quantity,
            "location": db.query(Product.location).filter(Product.id == item.product_id).scalar(),
        } for item in items
    ]
    warehouse_doc = WarehouseDocument(
        invoice_id=invoice.id,
        buyer_name=invoice.buyer_name,
        invoice_date=invoice.created_at,
        items_json=json.dumps(warehouse_items),
        status="NEW"
    )
    db.add(warehouse_doc)
    db.commit()

    write_log(
        db, user_id=current_user.id, action="INVOICE_CREATE", resource="invoices", status="SUCCESS",
        ip=request.client.host,
        meta={"invoice_id": invoice.id, "total_gross": total_gross, "buyer": invoice_data.buyer_name}
    )
    return invoice

# =========================
# LIST (FOR CUSTOMER)
# =========================
@router.get("/invoices/me", response_model=invoice_schemas.InvoiceListPage)
def list_my_invoices(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Invoice).filter(Invoice.user_id == current_user.id)
    query = query.order_by(Invoice.created_at.desc())

    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": invoices, "total": total, "page": page, "page_size": page_size}

# =========================
# GET INVOICE DETAIL
# =========================
@router.get("/invoices/{invoice_id}", response_model=invoice_schemas.InvoiceDetail)
def get_invoice(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = _check_pdf_permission(db, invoice_id, current_user)

    detailed_items = [
        {
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "price_net": item.price_net,
            "tax_rate": item.tax_rate,
            "total_net": item.total_net,
            "total_gross": item.total_gross,
        } for item in invoice.items
    ]
    
    write_log(
        db, user_id=current_user.id, action="INVOICE_GET", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice.id}
    )

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

# =========================
# LIST (FOR ADMIN/SALES)
# =========================
@router.get("/invoices", response_model=invoice_schemas.InvoiceListPage)
def list_invoices(
    request: Request,
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "buyer_name", "total_gross", "id"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Invoice)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Invoice.buyer_name.ilike(like), Invoice.buyer_nip.ilike(like)))

    if date_from: query = query.filter(Invoice.created_at >= date_from)
    if date_to: query = query.filter(Invoice.created_at <= date_to)

    sort_map = {
        "id": Invoice.id,
        "created_at": Invoice.created_at,
        "buyer_name": Invoice.buyer_name,
        "total_gross": Invoice.total_gross,
    }
    col = sort_map.get(sort_by, Invoice.created_at)
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": invoices, "total": total, "page": page, "page_size": page_size}

# =========================
# PDF ENDPOINTS
# =========================

@router.post("/invoices/{invoice_id}/pdf")
def generate_invoice_pdf_endpoint(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generuje plik PDF na serwerze używając funkcji z utils/pdf.py.
    """
    invoice = _check_pdf_permission(db, invoice_id, current_user)
    out_path = get_pdf_path(invoice.id)
    
    # Pobranie danych firmy do nagłówka
    company = db.query(Company).first()
    company_dict = None
    if company:
        company_dict = {
            "name": company.name, 
            "nip": company.nip, 
            "address": company.address,
            "phone": getattr(company, "phone", None),
            "email": getattr(company, "email", None)
        }
    
    # Wywołanie generatora z utils
    try:
        generate_invoice_pdf(invoice, invoice.items, out_path, company=company_dict)
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd generowania PDF: {e}")

    # Aktualizacja ścieżki w bazie
    if hasattr(invoice, "pdf_path"):
        invoice.pdf_path = str(out_path)
        db.commit()

    write_log(
        db, user_id=current_user.id, action="INVOICE_PDF_GENERATE", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice.id, "pdf_path": str(out_path)}
    )
    
    return {"message": "PDF generated", "path": str(out_path)}


@router.get("/invoices/{invoice_id}/download")
def download_invoice_pdf_endpoint(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pobiera fakturę PDF. Jeśli plik nie istnieje, zostanie wygenerowany automatycznie.
    """
    invoice_for_check = _check_pdf_permission(db, invoice_id, current_user)
    
    # Ustalanie ścieżki
    pdf_path = Path(getattr(invoice_for_check, "pdf_path", "") or get_pdf_path(invoice_for_check.id))
    
    # Automatyczne generowanie jeśli brak pliku
    if not pdf_path.exists():
        try:
            full_invoice_details = _check_pdf_permission(db, invoice_id, current_user)
            company = db.query(Company).first()
            company_dict = None
            if company:
                company_dict = {
                    "name": company.name, 
                    "nip": company.nip, 
                    "address": company.address,
                    "phone": getattr(company, "phone", None),
                    "email": getattr(company, "email", None)
                }
            
            generate_invoice_pdf(full_invoice_details, full_invoice_details.items, pdf_path, company=company_dict)
            
            if hasattr(full_invoice_details, "pdf_path"):
                full_invoice_details.pdf_path = str(pdf_path)
                db.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not generate PDF: {e}")

    write_log(
        db, user_id=current_user.id, action="INVOICE_PDF_DOWNLOAD", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice_for_check.id}
    )

    filename = f"Faktura_INV_{invoice_for_check.id}.pdf"

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename 
    )