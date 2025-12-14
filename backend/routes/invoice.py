# backend/routes/invoice.py
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional, Literal, List, Dict, Any, Union
from sqlalchemy import or_, func, case
from pathlib import Path
import json
from datetime import datetime

# Models
from models.invoice import Invoice, InvoiceItem, PaymentStatus
from models.product import Product
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from models.company import Company
from models.users import User
from database import get_db
from utils.tokenJWT import get_current_user
from utils.audit import write_log
from schemas import invoice as invoice_schemas
from utils.pdf import generate_invoice_pdf, get_pdf_path

router = APIRouter(tags=["Invoices"])

# =========================
# HELPER: PERMISSIONS
# =========================
def _check_pdf_permission(db: Session, invoice_id: int, user: User) -> Invoice:
    # Verify user access rights for invoice PDF generation
    invoice = db.query(Invoice).options(
        joinedload(Invoice.items),
        joinedload(Invoice.parent).joinedload(Invoice.items)
    ).filter(Invoice.id == invoice_id).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    is_admin_or_sales = (user.role or "").upper() in {"ADMIN", "SALESMAN"}
    is_owner = invoice.user_id == user.id

    if not is_admin_or_sales and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")
        
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
    # Retrieve a paginated list of invoices for the current user
    if not current_user:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Invoice).filter(Invoice.user_id == current_user.id)
    query = query.order_by(Invoice.created_at.desc())

    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": invoices, "total": total, "page": page, "page_size": page_size}


# =========================
# MANUAL INVOICE CREATION + AUTO WZ
# =========================
@router.post("/invoices", response_model=invoice_schemas.InvoiceResponse)
def create_invoice(
    request: Request,
    invoice_data: invoice_schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Restrict invoice creation to Admin and Salesman roles
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to issue invoices")

    # Determine next invoice number
    last_number = db.query(func.max(Invoice.number)).filter(
        (Invoice.is_correction == False) | (Invoice.is_correction == None)
    ).scalar()
    new_number = (last_number or 0) + 1

    total_net, total_vat, total_gross = 0.0, 0.0, 0.0
    items = []

    # Process invoice items and validate stock
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

    # Use buyer address as default shipping address
    shipping_addr = invoice_data.buyer_address
    
    now = datetime.now()

    # Create and save invoice record
    invoice = Invoice(
        buyer_name=invoice_data.buyer_name,
        buyer_nip=invoice_data.buyer_nip,
        buyer_address=invoice_data.buyer_address,
        shipping_address=shipping_addr, 
        created_by=current_user.id,
        user_id=current_user.id,
        created_at=now,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        items=items,
        number=new_number
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Automatically generate associated Warehouse Document (WZ)
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
        invoice_date=now,
        created_at=now,
        items_json=json.dumps(warehouse_items),
        status=WarehouseStatus.NEW,
        shipping_address=shipping_addr 
    )
    db.add(warehouse_doc)
    db.commit()

    write_log(
        db, user_id=current_user.id, action="INVOICE_CREATE", resource="invoices", status="SUCCESS",
        ip=request.client.host,
        meta={"invoice_id": invoice.id, "total_gross": total_gross, "wz_id": warehouse_doc.id}
    )
    return invoice


# =========================
# CORRECTION INVOICE
# =========================
@router.post("/invoices/{invoice_id}/correction", response_model=invoice_schemas.InvoiceResponse)
def create_invoice_correction(
    invoice_id: int,
    correction_data: invoice_schemas.InvoiceCorrectionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Brak uprawnień")

    # Validate original invoice
    original_invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not original_invoice:
        raise HTTPException(status_code=404, detail="Faktura nie istnieje")
    if original_invoice.is_correction:
        raise HTTPException(status_code=400, detail="Nie można korygować korekty")

    # Calculate correction sequence number
    existing_corrections_count = db.query(Invoice).filter(Invoice.parent_id == original_invoice.id).count()
    new_seq = existing_corrections_count + 1

    total_net, total_vat, total_gross = 0.0, 0.0, 0.0
    new_items = []

    # Process correction items
    for item_data in correction_data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product: continue

        price_net = item_data.price_net if item_data.price_net is not None else product.sell_price_net
        tax_rate = item_data.tax_rate if item_data.tax_rate is not None else product.tax_rate
        quantity = item_data.quantity

        total_item_net = price_net * quantity
        total_item_gross = total_item_net * (1 + tax_rate / 100)
        
        total_net += total_item_net
        total_vat += (total_item_gross - total_item_net)
        total_gross += total_item_gross

        new_items.append(
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

    # Create correction invoice linked to parent
    correction_invoice = Invoice(
        buyer_name=correction_data.buyer_name,
        buyer_nip=correction_data.buyer_nip,
        buyer_address=correction_data.buyer_address,
        shipping_address=original_invoice.shipping_address, # Copy address from original
        created_by=current_user.id,
        user_id=original_invoice.user_id,
        
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        
        items=new_items,
        
        is_correction=True,
        parent_id=original_invoice.id,
        correction_reason=correction_data.correction_reason,
        correction_seq=new_seq 
    )

    db.add(correction_invoice)
    db.commit()
    db.refresh(correction_invoice)

    write_log(
        db, user_id=current_user.id, action="INVOICE_CORRECTION", resource="invoices", status="SUCCESS",
        ip=request.client.host,
        meta={"invoice_id": correction_invoice.id, "parent_id": original_invoice.id}
    )
    
    return correction_invoice


@router.get("/invoices/{invoice_id}", response_model=invoice_schemas.InvoiceDetail)
def get_invoice(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Retrieve invoice details with permission check
    invoice = db.query(Invoice).options(joinedload(Invoice.items)).filter(Invoice.id == invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    is_admin_or_sales = (current_user.role or "").upper() in {"ADMIN", "SALESMAN"}
    is_owner = invoice.user_id == current_user.id
    if not is_admin_or_sales and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

    # Format detailed items response
    detailed_items = []
    for item in invoice.items:
        p_name = getattr(item, "product_name", None)
        if not p_name and item.product:
            p_name = item.product.name
        
        detailed_items.append({
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "price_net": item.price_net,
            "tax_rate": item.tax_rate,
            "total_net": item.total_net,
            "total_gross": item.total_gross,
        })
    
    write_log(
        db, user_id=current_user.id, action="INVOICE_GET", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice.id}
    )

    return {
        "id": invoice.id,
        "full_number": invoice.full_number,
        "buyer_name": invoice.buyer_name,
        "buyer_nip": invoice.buyer_nip,
        "buyer_address": invoice.buyer_address,
        "shipping_address": invoice.shipping_address, 
        "created_at": invoice.created_at,
        "total_net": invoice.total_net,
        "total_vat": invoice.total_vat,
        "total_gross": invoice.total_gross,
        "items": detailed_items,
        "is_correction": invoice.is_correction,
        "parent_id": invoice.parent_id,
        "correction_reason": invoice.correction_reason,
    }


@router.get("/invoices", response_model=invoice_schemas.InvoiceListPage)
def list_invoices(
    request: Request,
    q: Optional[str] = Query(None),
    search_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "buyer_name", "total_gross", "id"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # List invoices with filtering (Admin/Salesman only)
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(Invoice)
    
    # Filter by text (buyer name or NIP)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Invoice.buyer_name.ilike(like), Invoice.buyer_nip.ilike(like)))
    
    # Filter by specific ID or number
    if search_id:
        try:
            s_id = int(search_id)
            query = query.filter(or_(Invoice.id == s_id, Invoice.number == s_id, Invoice.parent_id == s_id))
        except ValueError:
            pass

    # Filter by date range
    if date_from: query = query.filter(Invoice.created_at >= date_from)
    if date_to: query = query.filter(Invoice.created_at <= date_to)

    family_id = func.coalesce(Invoice.parent_id, Invoice.id)

    # Sort logic grouping corrections with parents
    if sort_by == "created_at" or sort_by == "id":
        if order == "desc":
             query = query.order_by(family_id.desc(), Invoice.is_correction.asc(), Invoice.id.asc())
        else:
             query = query.order_by(family_id.asc(), Invoice.is_correction.asc(), Invoice.id.asc())
    else:
        sort_map = {
            "buyer_name": Invoice.buyer_name,
            "total_gross": Invoice.total_gross,
        }
        col = sort_map.get(sort_by, Invoice.created_at)
        query = query.order_by(col.asc() if order == "asc" else col.desc())

    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": invoices, "total": total, "page": page, "page_size": page_size}


@router.post("/invoices/{invoice_id}/pdf")
def generate_invoice_pdf_endpoint(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Trigger PDF generation for an invoice
    invoice = _check_pdf_permission(db, invoice_id, current_user)
    out_path = get_pdf_path(invoice.id)
    
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
    
    try:
        generate_invoice_pdf(invoice, invoice.items, out_path, company=company_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd generowania PDF: {e}")
    
    return {"message": "PDF generated", "path": str(out_path)}


@router.get("/invoices/{invoice_id}/download")
def download_invoice_pdf_endpoint(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Download invoice PDF, generate if missing
    invoice_for_check = _check_pdf_permission(db, invoice_id, current_user)
    pdf_path = get_pdf_path(invoice_for_check.id)
    
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
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not generate PDF: {e}")

    write_log(
        db, user_id=current_user.id, action="INVOICE_PDF_DOWNLOAD", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice_for_check.id}
    )

    filename = f"Faktura_{invoice_for_check.full_number.replace('/', '_')}.pdf"

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename 
    )