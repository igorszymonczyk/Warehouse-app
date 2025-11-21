# backend/routers/invoices.py

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional, Literal, List
from sqlalchemy import or_
from pathlib import Path
import json

from models.invoice import Invoice, InvoiceItem
from models.product import Product
from models.WarehouseDoc import WarehouseDocument
from models.company import Company
from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from schemas import invoice as invoice_schemas
from utils.audit import write_log
from datetime import datetime

router = APIRouter(tags=["Invoices"])


# =========================
# PDF & FONT HELPERS
# =========================
STORAGE_DIR = Path("storage/invoices")
FONT_DIR = Path("assets/fonts")
FONT_REGULAR_PATH = FONT_DIR / "DejaVuSans.ttf"
FONT_BOLD_PATH = FONT_DIR / "DejaVuSans-Bold.ttf"

FONT_REGULAR_NAME = "DejaVuSans"
FONT_BOLD_NAME = "DejaVuSans-Bold"

def _ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def _pdf_path_for(invoice_id: int) -> Path:
    return STORAGE_DIR / f"INV-{invoice_id}.pdf"

_fonts_inited = False
def _init_fonts():
    """Initializes Polish character fonts in ReportLab."""
    global _fonts_inited, FONT_BOLD_NAME
    if _fonts_inited:
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        if not FONT_REGULAR_PATH.exists():
            raise FileNotFoundError(f"Font file not found: {FONT_REGULAR_PATH}")

        pdfmetrics.registerFont(TTFont(FONT_REGULAR_NAME, str(FONT_REGULAR_PATH)))

        if FONT_BOLD_PATH.exists():
            pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(FONT_BOLD_PATH)))
        else:
            FONT_BOLD_NAME = FONT_REGULAR_NAME # Fallback to regular if bold is missing
        
        _fonts_inited = True

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="reportlab is not installed. Run: python -m pip install reportlab",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Font init error: {e}")

def _generate_invoice_pdf_file(invoice: Invoice, items: List[InvoiceItem], out_path: Path, company: dict | None = None) -> None:
    """Generates a PDF file for an invoice with Polish character support."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="reportlab is not installed. Run: python -m pip install reportlab",
        )

    _init_fonts()
    _ensure_storage_dir()

    c = canvas.Canvas(str(out_path), pagesize=A4)
    width, height = A4

    y = height - 30 * mm
    c.setFont(FONT_BOLD_NAME, 16)
    # Company details on top-left (if provided)
    if company:
        c.setFont(FONT_BOLD_NAME, 12)
        if company.get("name"):
            c.drawString(20 * mm, y, str(company.get("name")))
            y -= 6 * mm
        c.setFont(FONT_REGULAR_NAME, 10)
        if company.get("nip"):
            c.drawString(20 * mm, y, f"NIP: {company.get('nip')}")
            y -= 6 * mm
        if company.get("address"):
            c.drawString(20 * mm, y, f"Adres: {company.get('address')}")
            y -= 8 * mm
        # leave a little gap before invoice header
        y -= 4 * mm

    c.setFont(FONT_BOLD_NAME, 16)
    c.drawString(120 * mm, height - 30 * mm, f"Faktura: INV-{invoice.id}")
    c.setFont(FONT_REGULAR_NAME, 10)
    c.drawString(120 * mm, height - 36 * mm, f"Data: {getattr(invoice, 'created_at', '')}")

    # Buyer block (left, under company if present)
    y_buyer = height - 54 * mm
    c.setFont(FONT_REGULAR_NAME, 10)
    c.drawString(20 * mm, y_buyer, f"Nabywca: {invoice.buyer_name or ''}")
    y_buyer -= 6 * mm
    if getattr(invoice, "buyer_nip", None):
        c.drawString(20 * mm, y_buyer, f"NIP: {invoice.buyer_nip}")
        y_buyer -= 6 * mm
    if getattr(invoice, "buyer_address", None):
        c.drawString(20 * mm, y_buyer, f"Adres: {invoice.buyer_address}")
        y_buyer -= 10 * mm
    else:
        y_buyer -= 6 * mm

    # Start table lower, reuse y variable
    y = y_buyer - 6 * mm

    # Table Headers
    c.setFont(FONT_BOLD_NAME, 10)
    c.drawString(20 * mm, y, "Produkt")
    c.drawString(90 * mm, y, "Ilość")
    c.drawString(110 * mm, y, "Cena netto")
    c.drawString(140 * mm, y, "Wartość brutto")
    y -= 6 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 6 * mm

    # Table Rows
    c.setFont(FONT_REGULAR_NAME, 10)
    for it in items:
        # Use the saved product_name for historical accuracy
        prod_name = getattr(it, "product_name", f"ID:{it.product_id}")
        c.drawString(20 * mm, y, str(prod_name)[:60])
        c.drawRightString(105 * mm, y, f"{it.quantity}")
        c.drawRightString(135 * mm, y, f"{it.price_net:.2f}")
        c.drawRightString(190 * mm, y, f"{it.total_gross:.2f}")
        y -= 6 * mm
        if y < 30 * mm:
            c.showPage()
            y = height - 20 * mm
            c.setFont(FONT_REGULAR_NAME, 10)

    # Summary
    y -= 6 * mm
    c.line(120 * mm, y, 190 * mm, y)
    y -= 8 * mm
    c.setFont(FONT_BOLD_NAME, 11)
    c.drawRightString(170 * mm, y, "Suma netto:")
    c.drawRightString(190 * mm, y, f"{invoice.total_net:.2f}")
    y -= 6 * mm
    c.drawRightString(170 * mm, y, "Suma VAT:")
    c.drawRightString(190 * mm, y, f"{invoice.total_vat:.2f}")
    y -= 6 * mm
    c.drawRightString(170 * mm, y, "Suma brutto:")
    c.drawRightString(190 * mm, y, f"{invoice.total_gross:.2f}")

    c.showPage()
    c.save()

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
                product_name=product.name,  # --- FIX: Snapshot product name for data integrity
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
    invoice = db.query(Invoice).options(joinedload(Invoice.items)).filter(Invoice.id == invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # --- FIX: Correct authorization check ---
    is_admin_or_sales = (current_user.role or "").upper() in {"ADMIN", "SALESMAN"}
    is_owner = invoice.user_id == current_user.id
    if not is_admin_or_sales and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

    detailed_items = [
        {
            "product_id": item.product_id,
            "product_name": item.product_name, # --- FIX: Use snapshotted name
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
# PDF: GENERATE & DOWNLOAD
# =========================
def _check_pdf_permission(db: Session, invoice_id: int, user: User) -> Invoice:
    """Helper to check PDF access for admin, salesman, or owner."""
    invoice = db.query(Invoice).options(joinedload(Invoice.items)).filter(Invoice.id == invoice_id).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    is_admin_or_sales = (user.role or "").upper() in {"ADMIN", "SALESMAN"}
    is_owner = invoice.user_id == user.id

    if not is_admin_or_sales and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")
        
    return invoice

@router.post("/invoices/{invoice_id}/pdf")
def generate_invoice_pdf(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = _check_pdf_permission(db, invoice_id, current_user)
    out_path = _pdf_path_for(invoice.id)
    # attach company data if available
    company = db.query(Company).first()
    company_dict = None
    if company:
        company_dict = {"name": company.name, "nip": company.nip, "address": company.address}
    _generate_invoice_pdf_file(invoice, invoice.items, out_path, company=company_dict)

    if hasattr(invoice, "pdf_path"):
        invoice.pdf_path = str(out_path)
        db.commit()

    write_log(
        db, user_id=current_user.id, action="INVOICE_PDF_GENERATE", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice.id, "pdf_path": str(out_path)}
    )
    return {"message": "PDF generated", "path": str(out_path)}


@router.get("/invoices/{invoice_id}/download")
def download_invoice_pdf(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice_for_check = _check_pdf_permission(db, invoice_id, current_user)
    
    pdf_path = Path(getattr(invoice_for_check, "pdf_path", "") or _pdf_path_for(invoice_for_check.id))
    
    if not pdf_path.exists():
        try:
            # Re-fetch with all items for generation
            full_invoice_details = _check_pdf_permission(db, invoice_id, current_user)
            company = db.query(Company).first()
            company_dict = None
            if company:
                company_dict = {"name": company.name, "nip": company.nip, "address": company.address}
            _generate_invoice_pdf_file(full_invoice_details, full_invoice_details.items, pdf_path, company=company_dict)
            if hasattr(full_invoice_details, "pdf_path"):
                full_invoice_details.pdf_path = str(pdf_path)
                db.commit()
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"PDF not found and could not be generated: {e}")

    write_log(
        db, user_id=current_user.id, action="INVOICE_PDF_DOWNLOAD", resource="invoices", status="SUCCESS",
        ip=request.client.host, meta={"invoice_id": invoice_for_check.id, "pdf_path": str(pdf_path)}
    )

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"Faktura-INV-{invoice_for_check.id}.pdf", 
    )