# backend/utils/pdf.py

from pathlib import Path
from typing import List, Any
# Importujemy modele tylko dla type hintingu (opcjonalne, ale pomaga w IDE)
# Jeśli masz problem z cyklicznym importem, usuń importy modeli i type hinty
from models.invoice import Invoice, InvoiceItem 

# Konfiguracja ścieżek
STORAGE_DIR = Path("storage/invoices")
FONT_DIR = Path("assets/fonts")
FONT_REGULAR_PATH = FONT_DIR / "DejaVuSans.ttf"
FONT_BOLD_PATH = FONT_DIR / "DejaVuSans-Bold.ttf"

FONT_REGULAR_NAME = "DejaVuSans"
FONT_BOLD_NAME = "DejaVuSans-Bold"

def ensure_storage_dir() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def get_pdf_path(invoice_id: int) -> Path:
    """Zwraca ścieżkę do pliku PDF dla danej faktury."""
    ensure_storage_dir()
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
            print(f"Warning: Font file not found at {FONT_REGULAR_PATH}")
            return 

        pdfmetrics.registerFont(TTFont(FONT_REGULAR_NAME, str(FONT_REGULAR_PATH)))

        if FONT_BOLD_PATH.exists():
            pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(FONT_BOLD_PATH)))
        else:
            FONT_BOLD_NAME = FONT_REGULAR_NAME 
        
        _fonts_inited = True

    except ImportError:
        print("ReportLab not installed. Run: pip install reportlab")
    except Exception as e:
        print(f"Font init warning: {e}")

def generate_invoice_pdf(invoice: Invoice, items: List[InvoiceItem], out_path: Path, company: dict | None = None) -> None:
    """
    Generuje PDF faktury z układem:
    - Nagłówek
    - Sprzedawca (lewo) + Kontakt / Nabywca (prawo)
    - Tabela produktów
    - Podsumowanie
    - Stopka z podpisami
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
    except ImportError:
        raise ImportError("reportlab is not installed. Run: python -m pip install reportlab")

    _init_fonts()
    ensure_storage_dir()

    c = canvas.Canvas(str(out_path), pagesize=A4)
    width, height = A4

    # --- 1. NAGŁÓWEK ---
    y = height - 20 * mm
    c.setFont(FONT_BOLD_NAME, 18)
    c.drawRightString(190 * mm, y, f"Faktura: INV-{invoice.id}")
    y -= 8 * mm
    c.setFont(FONT_REGULAR_NAME, 10)
    c.drawRightString(190 * mm, y, f"Data wystawienia: {getattr(invoice, 'created_at', '')}")
    
    y -= 6 * mm
    c.setLineWidth(0.5)
    c.line(20 * mm, y, 190 * mm, y)
    y -= 10 * mm

    # --- 2. KOLUMNY: SPRZEDAWCA vs NABYWCA ---
    y_start_columns = y
    
    # >> Lewa kolumna: SPRZEDAWCA
    c.setFont(FONT_BOLD_NAME, 10)
    c.drawString(20 * mm, y, "SPRZEDAWCA:")
    y -= 5 * mm
    c.setFont(FONT_REGULAR_NAME, 10)
    
    if company:
        # Nazwa firmy
        c.setFont(FONT_BOLD_NAME, 10)
        c.drawString(20 * mm, y, str(company.get("name") or ""))
        y -= 5 * mm
        c.setFont(FONT_REGULAR_NAME, 10)
        
        # NIP
        if company.get("nip"):
            c.drawString(20 * mm, y, f"NIP: {company.get('nip')}")
            y -= 5 * mm
        
        # Adres
        if company.get("address"):
            addr = str(company.get("address"))
            c.drawString(20 * mm, y, f"Adres: {addr[:40]}")
            if len(addr) > 40:
                 y -= 4 * mm
                 c.drawString(32 * mm, y, addr[40:])
            y -= 5 * mm
        
        # Kontakt (Telefon / Email)
        if company.get("phone"):
            c.drawString(20 * mm, y, f"Tel: {company.get('phone')}")
            y -= 5 * mm
        if company.get("email"):
            c.drawString(20 * mm, y, f"Email: {company.get('email')}")
            y -= 5 * mm
    else:
        c.drawString(20 * mm, y, "Brak danych firmy w systemie")

    # >> Prawa kolumna: NABYWCA (Resetujemy Y do góry)
    y = y_start_columns 
    c.setFont(FONT_BOLD_NAME, 10)
    c.drawString(110 * mm, y, "NABYWCA:")
    y -= 5 * mm
    c.setFont(FONT_REGULAR_NAME, 10)
    
    # Nazwa nabywcy
    c.setFont(FONT_BOLD_NAME, 10)
    c.drawString(110 * mm, y, str(invoice.buyer_name or "Klient detaliczny"))
    y -= 5 * mm
    c.setFont(FONT_REGULAR_NAME, 10)
    
    # NIP
    if getattr(invoice, "buyer_nip", None):
        c.drawString(110 * mm, y, f"NIP: {invoice.buyer_nip}")
        y -= 5 * mm
    
    # Adres
    if getattr(invoice, "buyer_address", None):
        addr = str(invoice.buyer_address)
        c.drawString(110 * mm, y, f"Adres: {addr[:40]}")
        if len(addr) > 40:
            y -= 4 * mm
            c.drawString(122 * mm, y, addr[40:])
        y -= 5 * mm

    # Ustawiamy Y poniżej najdłuższej kolumny (bezpieczny margines)
    y = y_start_columns - 50 * mm 

    # --- 3. TABELA POZYCJI ---
    # Nagłówek tabeli
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(20 * mm, y - 2*mm, 170 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)

    c.setFont(FONT_BOLD_NAME, 9)
    c.drawString(22 * mm, y, "Lp.")
    c.drawString(32 * mm, y, "Produkt")
    c.drawRightString(105 * mm, y, "Ilość")
    c.drawRightString(130 * mm, y, "Cena netto")
    c.drawRightString(150 * mm, y, "VAT")
    c.drawRightString(185 * mm, y, "Wartość brutto")
    y -= 8 * mm

    # Wiersze
    c.setFont(FONT_REGULAR_NAME, 9)
    idx = 1
    for it in items:
        prod_name = getattr(it, "product_name", f"ID:{it.product_id}")
        
        c.drawString(22 * mm, y, str(idx))
        c.drawString(32 * mm, y, str(prod_name)[:45])
        c.drawRightString(105 * mm, y, f"{it.quantity}")
        c.drawRightString(130 * mm, y, f"{it.price_net:.2f}")
        c.drawRightString(150 * mm, y, f"{int(it.tax_rate)}%")
        c.drawRightString(185 * mm, y, f"{it.total_gross:.2f}")
        
        c.setLineWidth(0.1)
        c.line(20 * mm, y - 2*mm, 190 * mm, y - 2*mm)
        
        y -= 6 * mm
        idx += 1

        # Obsługa nowej strony (zostawiamy miejsce na podpisy!)
        if y < 60 * mm: 
            c.showPage()
            y = height - 30 * mm
            c.setFont(FONT_REGULAR_NAME, 9)

    # --- 4. PODSUMOWANIE ---
    y -= 5 * mm
    c.setFont(FONT_BOLD_NAME, 10)
    
    c.drawRightString(150 * mm, y, "Suma netto:")
    c.drawRightString(185 * mm, y, f"{invoice.total_net:.2f} PLN")
    y -= 5 * mm
    
    c.drawRightString(150 * mm, y, "Suma VAT:")
    c.drawRightString(185 * mm, y, f"{invoice.total_vat:.2f} PLN")
    y -= 6 * mm
    
    c.setFont(FONT_BOLD_NAME, 12)
    c.drawRightString(150 * mm, y, "RAZEM BRUTTO:")
    c.drawRightString(185 * mm, y, f"{invoice.total_gross:.2f} PLN")

    # --- 5. STOPKA (PODPISY) ---
    y_signatures = 35 * mm
    
    if y < y_signatures + 20 * mm:
        c.showPage()
    
    c.setLineWidth(0.5)
    c.setFont(FONT_REGULAR_NAME, 8)
    
    # Lewy podpis
    c.line(25 * mm, y_signatures, 85 * mm, y_signatures)
    c.drawCentredString(55 * mm, y_signatures - 4 * mm, "Imię, nazwisko i podpis osoby")
    c.drawCentredString(55 * mm, y_signatures - 8 * mm, "upoważnionej do wystawienia dokumentu")

    # Prawy podpis
    c.line(125 * mm, y_signatures, 185 * mm, y_signatures)
    c.drawCentredString(155 * mm, y_signatures - 4 * mm, "Imię, nazwisko i podpis osoby")
    c.drawCentredString(155 * mm, y_signatures - 8 * mm, "upoważnionej do odebrania dokumentu")

    c.showPage()
    c.save()