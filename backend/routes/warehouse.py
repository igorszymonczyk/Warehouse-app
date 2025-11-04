# routes/warehouse.py
from typing import Optional, Literal
from datetime import datetime
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.users import User
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus
from utils.tokenJWT import get_current_user
from utils.audit import write_log

from schemas.warehouse import WarehouseStatusUpdate, WarehouseDocPage

router = APIRouter(prefix="/warehouse-documents", tags=["Warehouse"])

# ---------- wspólne ----------
def _role_ok(user: User) -> bool:
    return (user.role or "").upper() in {"ADMIN", "WAREHOUSE"}

# =============================
# LISTA WZ (filtry/paginacja)
# =============================
@router.get("/", response_model=WarehouseDocPage)
def list_warehouse_documents(
    request: Request,
    status: Optional[WarehouseStatus] = Query(None, description="Filtruj po statusie"),
    buyer: Optional[str] = Query(None, description="Szukaj po nazwie klienta"),
    from_dt: Optional[str] = Query(None, description="ISO datetime, np. 2025-10-23T00:00:00"),
    to_dt: Optional[str] = Query(None, description="ISO datetime"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["created_at", "status", "buyer_name"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view warehouse documents")

    q = db.query(WarehouseDocument)

    if status:
        q = q.filter(WarehouseDocument.status == status)

    if buyer:
        like = f"%{buyer}%"
        q = q.filter(WarehouseDocument.buyer_name.ilike(like))

    def _parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Bad datetime format: {s}")

    fdt = _parse_iso(from_dt)
    tdt = _parse_iso(to_dt)

    # Walidacja dat
    if fdt and tdt and tdt < fdt:
        raise HTTPException(
            status_code=400,
            detail="Data 'do' nie może być wcześniejsza niż data 'od'."
        )

    # Filtrowanie po zakresie dat
    if fdt and tdt:
        q = q.filter(WarehouseDocument.created_at.between(fdt, tdt))
    elif fdt:
        q = q.filter(WarehouseDocument.created_at >= fdt)
    elif tdt:
        q = q.filter(WarehouseDocument.created_at <= tdt)

    # Sortowanie
    sort_map = {
        "created_at": WarehouseDocument.created_at,
        "status": WarehouseDocument.status,
        "buyer_name": WarehouseDocument.buyer_name,
    }
    col = sort_map[sort_by]
    q = q.order_by(col.asc() if order == "asc" else col.desc())

    # Paginacja
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total, "page": page, "page_size": page_size}

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
        raise HTTPException(status_code=403, detail="Not authorized to change status")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    old_status = doc.status
    new_status = status_data.status

    allowed_transitions = {
        WarehouseStatus.NEW: [WarehouseStatus.IN_PROGRESS, WarehouseStatus.CANCELLED],
        WarehouseStatus.IN_PROGRESS: [WarehouseStatus.RELEASED, WarehouseStatus.CANCELLED],
        WarehouseStatus.RELEASED: [],
        WarehouseStatus.CANCELLED: [],
    }

    if new_status not in allowed_transitions[old_status]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change status from {old_status} to {new_status}",
        )

    doc.status = new_status
    db.commit()
    db.refresh(doc)

    write_log(
        db,
        user_id=current_user.id,
        action="WAREHOUSE_STATUS_UPDATE",
        resource="warehouse_documents",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"doc_id": doc.id, "old_status": old_status, "new_status": new_status},
    )

    return {"message": f"Status changed from {old_status} → {new_status}"}

# =============================
# PDF: HELPERY dla WZ
# =============================
WZ_STORAGE_DIR = Path("storage/wz")

def _ensure_wz_dir() -> None:
    WZ_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def _wz_pdf_path(doc_id: int) -> Path:
    return WZ_STORAGE_DIR / f"WZ-{doc_id}.pdf"

# ---- fonty: szukamy w assets/fonts i fallback do fonts
BACKEND_DIR = Path(__file__).resolve().parents[1]  # .../backend
FONT_DIRS = [
    BACKEND_DIR / "assets" / "fonts",
    BACKEND_DIR / "fonts",
]

def _find_font(name: str) -> Optional[Path]:
    for d in FONT_DIRS:
        p = d / name
        if p.exists():
            return p
    return None

def _generate_wz_pdf(doc: WarehouseDocument, out_path: Path) -> None:
    """
    Generuje WZ w PDF z polskimi znakami (DejaVuSans + DejaVuSans-Bold).
    Oczekiwane pliki:
      - assets/fonts/DejaVuSans.ttf
      - assets/fonts/DejaVuSans-Bold.ttf
    (ew. fallback: backend/fonts/*)
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab is not installed. Run: python -m pip install reportlab")

    regular_path = _find_font("DejaVuSans.ttf")
    bold_path    = _find_font("DejaVuSans-Bold.ttf")

    if not regular_path or not bold_path:
        where = " or ".join(str(d) for d in FONT_DIRS)
        raise HTTPException(
            status_code=500,
            detail=f"Missing font files. Put DejaVuSans.ttf and DejaVuSans-Bold.ttf into {where}"
        )

    if "DejaVu" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVu", str(regular_path)))
    if "DejaVu-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(bold_path)))

    _ensure_wz_dir()

    c = canvas.Canvas(str(out_path), pagesize=A4)
    width, height = A4

    y = height - 30 * mm
    c.setFont("DejaVu-Bold", 16)
    c.drawString(20 * mm, y, f"Wydanie zewnętrzne WZ-{doc.id}")
    y -= 10 * mm

    c.setFont("DejaVu", 10)
    c.drawString(20 * mm, y, f"Data dokumentu: {str(getattr(doc, 'invoice_date', '') or '')}")
    y -= 6 * mm
    c.drawString(20 * mm, y, f"Odbiorca: {str(doc.buyer_name or '')}")
    y -= 10 * mm

    # Nagłówki
    c.setFont("DejaVu-Bold", 10)
    c.drawString(20 * mm,  y, "Produkt")
    c.drawString(95 * mm,  y, "Kod")
    c.drawString(130 * mm, y, "Ilość")
    c.drawString(155 * mm, y, "Lokalizacja")
    y -= 6 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 6 * mm

    # Wiersze
    c.setFont("DejaVu", 10)
    try:
        items = json.loads(doc.items_json or "[]")
    except Exception:
        items = []

    for it in items:
        name = str(it.get("product_name", "") or "")
        code = str(it.get("product_code", "") or "")
        qty  = str(it.get("quantity", "") or "")
        loc  = str(it.get("location", "") or "")

        c.drawString(20 * mm,  y, name[:45])
        c.drawString(95 * mm,  y, code[:20])
        c.drawRightString(145 * mm, y, qty)
        c.drawString(155 * mm, y, loc[:20])
        y -= 6 * mm

        if y < 30 * mm:
            c.showPage()
            y = height - 20 * mm
            c.setFont("DejaVu", 10)

    # Stopka
    y -= 8 * mm
    c.line(20 * mm, y, 190 * mm, y)
    y -= 8 * mm
    c.setFont("DejaVu", 10)
    c.drawString(20 * mm, y, "Uwagi:")
    y -= 6 * mm
    c.drawString(20 * mm, y, "(podpis wydającego) __________________________")
    c.drawString(110 * mm, y, "(podpis odbierającego) ______________________")

    c.showPage()
    c.save()

# =============================
# PDF: GENERUJ
# =============================
@router.post("/{doc_id}/pdf")
def generate_wz_pdf(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    out_path = _wz_pdf_path(doc.id)
    _generate_wz_pdf(doc, out_path)

    if hasattr(doc, "pdf_path"):
        doc.pdf_path = str(out_path)
        db.commit()

    try:
        write_log(
            db,
            user_id=current_user.id,
            action="WZ_PDF_GENERATE",
            resource="warehouse_documents",
            status="SUCCESS",
            ip=None,
            meta={"doc_id": doc.id, "pdf_path": str(out_path)},
        )
    except Exception:
        pass

    return {"message": "PDF generated", "path": str(out_path)}

# =============================
# PDF: POBIERZ
# =============================
@router.get("/{doc_id}/download")
def download_wz_pdf(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _role_ok(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    pdf_path = Path(getattr(doc, "pdf_path", "") or _wz_pdf_path(doc.id))
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found. Generate it first via POST /warehouse-documents/{id}/pdf")

    try:
        write_log(
            db,
            user_id=current_user.id,
            action="WZ_PDF_DOWNLOAD",
            resource="warehouse_documents",
            status="SUCCESS",
            ip=None,
            meta={"doc_id": doc.id, "pdf_path": str(pdf_path)},
        )
    except Exception:
        pass

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )

# =============================
# Wysłanie WZ do magazynu (cukier)
# =============================
@router.post("/{doc_id}/send")
def send_wz_to_warehouse(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sprzedawca/Administrator: oznacz WZ jako wysłane do magazynu (IN_PROGRESS).
    To „cukier” nad /{id}/status – ale ma własny audit i ewentualny hook na notyfikacje.
    """
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = db.query(WarehouseDocument).filter(WarehouseDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Warehouse document not found")

    if doc.status not in (WarehouseStatus.NEW,):
        raise HTTPException(status_code=400, detail=f"WZ is already {doc.status}, cannot send")

    # zmiana statusu
    doc.status = WarehouseStatus.IN_PROGRESS
    db.commit()
    db.refresh(doc)

    # (opcjonalnie) autogeneracja PDF jeśli jeszcze nie ma
    try:
        pdf_path = getattr(doc, "pdf_path", "") or ""
        if not pdf_path:
            out_path = _wz_pdf_path(doc.id)
            _generate_wz_pdf(doc, out_path)
            if hasattr(doc, "pdf_path"):
                doc.pdf_path = str(out_path)
                db.commit()
    except Exception:
        # nie blokujemy akcji jeśli PDF się nie uda – log i dalej
        pass

    # tu można wpiąć realną notyfikację (mail/webhook/ws)
    write_log(
        db,
        user_id=current_user.id,
        action="WZ_SEND",
        resource="warehouse_documents",
        status="SUCCESS",
        ip=request.client.host if request.client else None,
        meta={"doc_id": doc.id, "new_status": doc.status},
    )

    return {"message": "WZ sent to warehouse", "doc_id": doc.id, "status": doc.status}
