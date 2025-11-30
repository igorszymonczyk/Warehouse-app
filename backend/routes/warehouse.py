# backend/routes/warehouse.py
from typing import Optional, Literal, List
from datetime import datetime
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.users import User
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from models.invoice import Invoice
from models.order import Order
from utils.tokenJWT import get_current_user
from utils.audit import write_log

from schemas.warehouse import WarehouseStatusUpdate, WarehouseDocPage, WarehouseDocDetail, WzProductItem 

router = APIRouter(prefix="/warehouse-documents", tags=["Warehouse"])

# ---------- wspólne ----------
def _role_ok(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "WAREHOUSE"}

def _document_to_detail_schema(doc: WarehouseDocument) -> WarehouseDocDetail:
    """Konwertuje obiekt WZ z bazy do schematu Detal (parsowanie JSON)."""
    try:
        items_data = json.loads(doc.items_json or "[]")
    except Exception:
        items_data = []
        
    items = []
    for it in items_data:
        # Pobieramy ilość (obsługa starych i nowych zapisów)
        raw_qty = it.get('quantity') or it.get('qty') or 0
        
        try:
            qty_val = float(raw_qty)
        except (ValueError, TypeError):
            qty_val = 0.0

        items.append(WzProductItem(
            product_name=it.get('product_name', 'Nieznany produkt'),
            product_code=it.get('product_code', 'N/A'),
            # ZMIANA: Przypisujemy do 'quantity', a nie 'qty'
            quantity=qty_val, 
            location=it.get('location', None),
        ))
        
    return WarehouseDocDetail(
        id=doc.id,
        invoice_id=doc.invoice_id,
        buyer_name=doc.buyer_name,
        status=doc.status,
        created_at=doc.created_at,
        items=items,
    )

# =============================
# LISTA WZ
# =============================
@router.get("/", response_model=WarehouseDocPage)
def list_warehouse_documents(
    request: Request,
    status: Optional[List[WarehouseStatus]] = Query(None),
    buyer: Optional[str] = Query(None),
    from_dt: Optional[str] = Query(None),
    to_dt: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "status", "buyer_name"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    q = db.query(WarehouseDocument)

    if status:
        status_values = [s.value for s in status]
        q = q.filter(WarehouseDocument.status.in_(status_values))

    if buyer:
        q = q.filter(WarehouseDocument.buyer_name.ilike(f"%{buyer}%"))

    def _parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s: return None
        try: return datetime.fromisoformat(s)
        except ValueError: raise HTTPException(status_code=400, detail=f"Bad datetime format: {s}")

    fdt = _parse_iso(from_dt)
    tdt = _parse_iso(to_dt)

    if fdt and tdt: q = q.filter(WarehouseDocument.created_at.between(fdt, tdt))
    elif fdt: q = q.filter(WarehouseDocument.created_at >= fdt)
    elif tdt: q = q.filter(WarehouseDocument.created_at <= tdt)

    sort_map = {"created_at": WarehouseDocument.created_at, "status": WarehouseDocument.status, "buyer_name": WarehouseDocument.buyer_name}
    col = sort_map.get(sort_by, WarehouseDocument.created_at)
    q = q.order_by(col.asc() if order == "asc" else col.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total, "page": page, "page_size": page_size}

# =============================
# SZCZEGÓŁY WZ
# =============================
@router.get("/{doc_id}", response_model=WarehouseDocDetail)
def get_wz_detail(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    return _document_to_detail_schema(doc)

# =============================
# ZMIANA STATUSU
# =============================
@router.patch("/{doc_id}/status")
def update_warehouse_status(
    doc_id: int,
    status_data: WarehouseStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    old_status = doc.status
    new_status = status_data.status
    
    doc.status = new_status
    db.commit()
    db.refresh(doc)

    write_log(
        db, user_id=current_user.id, action="WAREHOUSE_STATUS_UPDATE", resource="warehouse_documents",
        status="SUCCESS", ip=request.client.host if request.client else None,
        meta={"doc_id": doc.id, "old_status": old_status, "new_status": new_status},
    )

    try:
        if new_status == WarehouseStatus.RELEASED:
            inv = db.query(Invoice).filter(Invoice.id == doc.invoice_id).first()
            if inv and inv.order_id:
                order = db.query(Order).filter(Order.id == inv.order_id).first()
                if order:
                    order.status = "shipped"
                    db.commit()
    except Exception:
        pass

    return {"message": f"Status changed from {old_status} → {new_status}"}

# =============================
# PDF
# =============================
WZ_STORAGE_DIR = Path("storage/wz")

def _ensure_wz_dir() -> None:
    WZ_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def _wz_pdf_path(doc_id: int) -> Path:
    return WZ_STORAGE_DIR / f"WZ-{doc_id}.pdf"

BACKEND_DIR = Path(__file__).resolve().parents[1]
FONT_DIRS = [BACKEND_DIR / "assets" / "fonts", BACKEND_DIR / "fonts"]

def _find_font(name: str) -> Optional[Path]:
    for d in FONT_DIRS:
        p = d / name
        if p.exists(): return p
    return None

def _generate_wz_pdf(doc: WarehouseDocument, out_path: Path) -> None:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab missing")

    regular_path = _find_font("DejaVuSans.ttf")
    bold_path    = _find_font("DejaVuSans-Bold.ttf")

    if "DejaVu" not in pdfmetrics.getRegisteredFontNames() and regular_path:
        pdfmetrics.registerFont(TTFont("DejaVu", str(regular_path)))
    if "DejaVu-Bold" not in pdfmetrics.getRegisteredFontNames() and bold_path:
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(bold_path)))

    _ensure_wz_dir()
    c = canvas.Canvas(str(out_path), pagesize=A4)
    y = 297 * mm - 30 * mm

    # Nagłówek
    try: c.setFont("DejaVu-Bold", 16)
    except: c.setFont("Helvetica-Bold", 16)
    c.drawString(20 * mm, y, f"Wydanie zewnętrzne WZ-{doc.id}")
    y -= 10 * mm

    try: c.setFont("DejaVu", 10)
    except: c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, f"Data: {str(doc.created_at or '')}")
    y -= 6 * mm
    c.drawString(20 * mm, y, f"Odbiorca: {str(doc.buyer_name or '')}")
    y -= 10 * mm

    # Tabela
    try: c.setFont("DejaVu-Bold", 10)
    except: c.setFont("Helvetica-Bold", 10)
    c.drawString(20 * mm, y, "Produkt")
    c.drawString(95 * mm, y, "Kod")
    c.drawString(130 * mm, y, "Ilość")
    c.drawString(155 * mm, y, "Lokalizacja")
    y -= 6 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 6 * mm

    try: c.setFont("DejaVu", 10)
    except: c.setFont("Helvetica", 10)
    
    try: items = json.loads(doc.items_json or "[]")
    except: items = []

    for it in items:
        name = str(it.get("product_name", "") or "")
        code = str(it.get("product_code", "") or "")
        qty  = str(it.get("quantity", "") or it.get("qty") or "")
        loc  = str(it.get("location", "") or "")

        c.drawString(20 * mm, y, name[:45])
        c.drawString(95 * mm, y, code[:20])
        c.drawRightString(145 * mm, y, str(qty))
        c.drawString(155 * mm, y, loc[:20])
        y -= 6 * mm
        if y < 30 * mm:
            c.showPage()
            y = 297 * mm - 20 * mm
            try: c.setFont("DejaVu", 10)
            except: c.setFont("Helvetica", 10)

    y -= 8 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 8 * mm
    c.drawString(20 * mm, y, "Uwagi: __________________________")
    y -= 10 * mm
    c.drawString(20 * mm, y, "Wydal: __________________________")
    c.drawString(110 * mm, y, "Odebral: ________________________")
    
    c.showPage()
    c.save()

@router.post("/{doc_id}/pdf")
def generate_wz_pdf(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _role_ok(current_user): raise HTTPException(403, "Not authorized")
    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc: raise HTTPException(404, "WZ not found")
    out_path = _wz_pdf_path(doc.id)
    _generate_wz_pdf(doc, out_path)
    if hasattr(doc, "pdf_path"):
        doc.pdf_path = str(out_path)
        db.commit()
    return {"message": "PDF generated"}

@router.get("/{doc_id}/download")
def download_wz_pdf(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _role_ok(current_user): raise HTTPException(403, "Not authorized")
    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc: raise HTTPException(404, "WZ not found")
    pdf_path = Path(getattr(doc, "pdf_path", "") or _wz_pdf_path(doc.id))
    if not pdf_path.exists():
        try:
            out_path = _wz_pdf_path(doc.id)
            _generate_wz_pdf(doc, out_path)
            pdf_path = out_path
        except: raise HTTPException(404, "PDF not found")
    return FileResponse(path=str(pdf_path), media_type="application/pdf", filename=pdf_path.name)