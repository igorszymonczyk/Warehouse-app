# routes/invoice.py
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional, Literal, List, Dict, Any
from sqlalchemy import or_
from pathlib import Path
import json

from models.invoice import Invoice, InvoiceItem
from models.product import Product
from models.WarehouseDoc import WarehouseDocument
from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
from schemas import invoice as invoice_schemas
from utils.audit import write_log
from datetime import datetime

router = APIRouter(tags=["Invoices"])


# POMOCNICZE: PDF + fonty PL
STORAGE_DIR = Path("storage/invoices")

FONT_DIR = Path("assets/fonts")
FONT_REGULAR_PATH = FONT_DIR / "DejaVuSans.ttf"
FONT_BOLD_PATH = FONT_DIR / "DejaVuSans-Bold.ttf"

# Nazwy logiczne fontów w ReportLab
FONT_REGULAR_NAME = "DejaVuSans"
FONT_BOLD_NAME = "DejaVuSans-Bold"

def _ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def _pdf_path_for(invoice_id: int) -> Path:
    return STORAGE_DIR / f"INV-{invoice_id}.pdf"

_fonts_inited = False
def _init_fonts():
    """Rejestruje TTF-y (polskie znaki) w ReportLab. Fallback gdy brak bolda."""
    global _fonts_inited, FONT_BOLD_NAME
    if _fonts_inited:
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        if not FONT_REGULAR_PATH.exists():
            raise FileNotFoundError(
                f"Brak pliku fontu: {FONT_REGULAR_PATH}. Umieść DejaVuSans.ttf w assets/fonts/."
            )

        pdfmetrics.registerFont(TTFont(FONT_REGULAR_NAME, str(FONT_REGULAR_PATH)))

        if FONT_BOLD_PATH.exists():
            pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(FONT_BOLD_PATH)))
        else:
            # jeśli nie ma bolda, używamy regularu pod obiema nazwami
            FONT_BOLD_NAME = FONT_REGULAR_NAME

        _fonts_inited = True
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="reportlab nie jest zainstalowany. Uruchom w venv: python -m pip install reportlab",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Font init error: {e}")

def _generate_invoice_pdf_file(invoice: Invoice, items: List[InvoiceItem], out_path: Path) -> None:
    """
    Generator PDF z polskimi znakami (DejaVuSans).
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="reportlab nie jest zainstalowany. Uruchom: python -m pip install reportlab",
        )

    _init_fonts()
    _ensure_storage_dir()

    c = canvas.Canvas(str(out_path), pagesize=A4)
    width, height = A4

    y = height - 30 * mm
    c.setFont(FONT_BOLD_NAME, 16)
    c.drawString(20 * mm, y, f"Faktura: INV-{invoice.id}")
    y -= 10 * mm

    c.setFont(FONT_REGULAR_NAME, 10)
    c.drawString(20 * mm, y, f"Data: {getattr(invoice, 'created_at', '')}")
    y -= 6 * mm
    c.drawString(20 * mm, y, f"Nabywca: {invoice.buyer_name or ''}")
    y -= 6 * mm
    if getattr(invoice, "buyer_nip", None):
        c.drawString(20 * mm, y, f"NIP: {invoice.buyer_nip}")
        y -= 6 * mm
    if getattr(invoice, "buyer_address", None):
        c.drawString(20 * mm, y, f"Adres: {invoice.buyer_address}")
        y -= 10 * mm
    else:
        y -= 6 * mm

    # Nagłówki
    c.setFont(FONT_BOLD_NAME, 10)
    c.drawString(20 * mm, y, "Produkt")
    c.drawString(90 * mm, y, "Ilość")
    c.drawString(110 * mm, y, "Cena netto")
    c.drawString(140 * mm, y, "Wartość brutto")
    y -= 6 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 6 * mm

    c.setFont(FONT_REGULAR_NAME, 10)
    for it in items:
        prod_name = getattr(getattr(it, "product", None), "name", None) or f"ID:{it.product_id}"
        c.drawString(20 * mm, y, str(prod_name)[:60])
        c.drawRightString(105 * mm, y, f"{it.quantity}")
        c.drawRightString(135 * mm, y, f"{it.price_net:.2f}")
        c.drawRightString(190 * mm, y, f"{it.total_gross:.2f}")
        y -= 6 * mm
        if y < 30 * mm:
            c.showPage()
            y = height - 20 * mm
            c.setFont(FONT_REGULAR_NAME, 10)

    # Podsumowanie
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
# CREATE
# =========================
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

    # --- UTWORZENIE FORMATKI MAGAZYNOWEJ (WZ) ---
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


# =========================
# DETAIL
# =========================
@router.get("/invoices/{invoice_id}", response_model=invoice_schemas.InvoiceDetail)
def get_invoice(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to view invoices")

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

    write_log(
        db,
        user_id=current_user.id,
        action="INVOICE_GET",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"invoice_id": invoice.id},
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
# LIST
# =========================
@router.get("/invoices", response_model=invoice_schemas.InvoiceListPage)
def list_invoices(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po nazwie lub NIP klienta"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "buyer_name", "total_gross"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    date_from: Optional[datetime] = Query(None, description="Filtruj od daty"),
    date_to: Optional[datetime] = Query(None, description="Filtruj do daty"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Uprawnienia
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to view invoices")

    #  Podstawowe zapytanie
    query = db.query(Invoice)

    # Filtrowanie po nazwie / NIP
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Invoice.buyer_name.ilike(like),
                Invoice.buyer_nip.ilike(like),
            )
        )

    # Filtrowanie po dacie wystawienia
    if date_from and date_to:
        if date_to < date_from:
            raise HTTPException(
                status_code=400,
                detail="Data 'do' nie może być wcześniejsza niż data 'od'."
            )
        query = query.filter(Invoice.created_at.between(date_from, date_to))
    elif date_from:
        query = query.filter(Invoice.created_at >= date_from)
    elif date_to:
        query = query.filter(Invoice.created_at <= date_to)

    # Sortowanie
    sort_map = {
        "created_at": Invoice.created_at,
        "buyer_name": Invoice.buyer_name,
        "total_gross": Invoice.total_gross,
    }
    col = sort_map.get(sort_by, Invoice.created_at)
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    # Paginacja
    total = query.count()
    invoices = query.offset((page - 1) * page_size).limit(page_size).all()

    # Logowanie
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
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
            "returned": len(invoices),
        },
    )

    # Zwracanie wyników
    return {
        "items": invoices,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# =========================
# PDF: GENERATE & DOWNLOAD
# =========================
@router.post("/invoices/{invoice_id}/pdf")
def generate_invoice_pdf(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    out_path = _pdf_path_for(invoice.id)
    _generate_invoice_pdf_file(invoice, invoice.items, out_path)

    if hasattr(invoice, "pdf_path"):
        invoice.pdf_path = str(out_path)
        db.commit()

    write_log(
        db,
        user_id=current_user.id,
        action="INVOICE_PDF_GENERATE",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"invoice_id": invoice.id, "pdf_path": str(out_path)},
    )

    return {"message": "PDF generated", "path": str(out_path)}


@router.get("/invoices/{invoice_id}/download")
def download_invoice_pdf(
    invoice_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf_path = Path(getattr(invoice, "pdf_path", "") or _pdf_path_for(invoice.id))
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found. Generate it first via POST /invoices/{id}/pdf")

    write_log(
        db,
        user_id=current_user.id,
        action="INVOICE_PDF_DOWNLOAD",
        resource="invoices",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"invoice_id": invoice.id, "pdf_path": str(pdf_path)},
    )

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )
