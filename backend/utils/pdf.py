# backend/utils/pdf.py

from pathlib import Path
from typing import List, Any
# Importujemy modele tylko dla type hintingu
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
    - Nagłówek (z obsługą korekty i sekwencji numeracji)
    - Sprzedawca (lewo) + Nabywca Było/Jest (prawo)
    - Tabela produktów (Było/Jest dla korekty)
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

    # Funkcja pomocnicza do rysowania tekstów
    def draw_text(x, y, text, font=FONT_REGULAR_NAME, size=10, align="left", color=(0,0,0)):
        c.setFillColorRGB(*color)
        c.setFont(font, size)
        text_str = str(text) if text is not None else ""
        if align == "right":
            c.drawRightString(x, y, text_str)
        elif align == "center":
            c.drawCentredString(x, y, text_str)
        else:
            c.drawString(x, y, text_str)
        c.setFillColorRGB(0,0,0) # Reset koloru

    # Sprawdzamy czy to korekta
    is_correction = getattr(invoice, "is_correction", False)
    parent = getattr(invoice, "parent", None)

    # --- 1. NAGŁÓWEK ---
    y = height - 20 * mm
    
    # Pobieramy pełny numer z modelu (obsługa FK, FK1 itd.)
    # Fallback do INV-{id} gdyby property nie istniało
    full_number = getattr(invoice, "full_number", f"INV-{invoice.id}")

    if is_correction:
        title = "FAKTURA KORYGUJĄCA"
        inv_number = full_number
    else:
        title = "Faktura"
        inv_number = full_number

    draw_text(190 * mm, y, f"{title}: {inv_number}", font=FONT_BOLD_NAME, size=16, align="right")
    y -= 8 * mm
    
    draw_text(190 * mm, y, f"Data wystawienia: {getattr(invoice, 'created_at', '')}", size=10, align="right")
    
    # Dodatkowe info dla korekty
    if is_correction and parent:
        y -= 5 * mm
        # Tutaj również możemy użyć full_number rodzica jeśli jest dostępny
        parent_number = getattr(parent, "full_number", f"INV-{parent.id}")
        draw_text(190 * mm, y, f"Dotyczy faktury: {parent_number} z dnia {getattr(parent, 'created_at', '')}", size=9, align="right")
        
        if getattr(invoice, "correction_reason", None):
            y -= 5 * mm
            draw_text(190 * mm, y, f"Przyczyna korekty: {invoice.correction_reason}", size=9, align="right")

    y -= 6 * mm
    c.setLineWidth(0.5)
    c.line(20 * mm, y, 190 * mm, y)
    y -= 10 * mm

    # --- 2. KOLUMNY: SPRZEDAWCA vs NABYWCA ---
    y_start_columns = y
    
    # >> Lewa kolumna: SPRZEDAWCA
    draw_text(20 * mm, y, "SPRZEDAWCA:", font=FONT_BOLD_NAME)
    y -= 5 * mm
    
    if company:
        draw_text(20 * mm, y, company.get("name") or "", font=FONT_BOLD_NAME)
        y -= 5 * mm
        
        if company.get("nip"):
            draw_text(20 * mm, y, f"NIP: {company.get('nip')}")
            y -= 5 * mm
        
        if company.get("address"):
            addr = str(company.get("address"))
            draw_text(20 * mm, y, f"Adres: {addr[:40]}")
            if len(addr) > 40:
                 y -= 4 * mm
                 draw_text(32 * mm, y, addr[40:])
            y -= 5 * mm
        
        if company.get("phone"):
            draw_text(20 * mm, y, f"Tel: {company.get('phone')}")
            y -= 5 * mm
        if company.get("email"):
            draw_text(20 * mm, y, f"Email: {company.get('email')}")
            y -= 5 * mm
    else:
        draw_text(20 * mm, y, "Brak danych firmy w systemie")

    # >> Prawa kolumna: NABYWCA
    y = y_start_columns 
    
    # Helper do rysowania bloku nabywcy
    def draw_buyer_block(start_y, label, name, nip, address, is_gray=False):
        local_y = start_y
        color = (0.5, 0.5, 0.5) if is_gray else (0, 0, 0)
        
        draw_text(110 * mm, local_y, label, font=FONT_BOLD_NAME, color=color)
        local_y -= 5 * mm
        
        draw_text(110 * mm, local_y, name or "Klient detaliczny", font=FONT_BOLD_NAME, color=color)
        local_y -= 5 * mm
        
        if nip:
            draw_text(110 * mm, local_y, f"NIP: {nip}", color=color)
            local_y -= 5 * mm
        
        if address:
            addr = str(address)
            draw_text(110 * mm, local_y, f"Adres: {addr[:40]}", color=color)
            if len(addr) > 40:
                local_y -= 4 * mm
                draw_text(122 * mm, local_y, addr[40:], color=color)
            local_y -= 5 * mm
        
        return local_y

    # Logika wyświetlania nabywcy
    if is_correction and parent:
        # 1. Dane aktualne (po korekcie)
        y = draw_buyer_block(y, "NABYWCA (PO KOREKCIE):", invoice.buyer_name, invoice.buyer_nip, invoice.buyer_address)
        
        # 2. Dane pierwotne (przed korektą) - rysujemy poniżej, na szaro
        y -= 5 * mm
        draw_buyer_block(y, "NABYWCA (PRZED KOREKTĄ):", parent.buyer_name, parent.buyer_nip, parent.buyer_address, is_gray=True)
    else:
        # Standardowy widok
        draw_buyer_block(y, "NABYWCA:", invoice.buyer_name, invoice.buyer_nip, invoice.buyer_address)

    # Ustawiamy Y poniżej najdłuższej kolumny
    y = y_start_columns - 70 * mm if is_correction else y_start_columns - 50 * mm

    # --- 3. TABELA POZYCJI (Helper) ---
    def draw_items_table(current_y, table_title, items_list):
        # Tytuł tabeli
        draw_text(20 * mm, current_y, table_title, font=FONT_BOLD_NAME, size=10)
        
        # --- FIX: Zwiększony odstęp, aby szary pasek nie zasłaniał tytułu ---
        current_y -= 10 * mm 

        # Nagłówek tabeli (szary pasek)
        c.setFillColorRGB(0.95, 0.95, 0.95)
        # Prostokąt tła nagłówka
        c.rect(20 * mm, current_y - 2*mm, 170 * mm, 8 * mm, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)

        c.setFont(FONT_BOLD_NAME, 9)
        c.drawString(22 * mm, current_y, "Lp.")
        c.drawString(32 * mm, current_y, "Produkt")
        c.drawRightString(105 * mm, current_y, "Ilość")
        c.drawRightString(130 * mm, current_y, "Cena netto")
        c.drawRightString(150 * mm, current_y, "VAT")
        c.drawRightString(185 * mm, current_y, "Wartość brutto")
        current_y -= 8 * mm

        # Wiersze
        c.setFont(FONT_REGULAR_NAME, 9)
        idx = 1
        for it in items_list:
            prod_name = getattr(it, "product_name", f"ID:{it.product_id}")
            
            c.drawString(22 * mm, current_y, str(idx))
            c.drawString(32 * mm, current_y, str(prod_name)[:45])
            c.drawRightString(105 * mm, current_y, f"{it.quantity}")
            c.drawRightString(130 * mm, current_y, f"{it.price_net:.2f}")
            c.drawRightString(150 * mm, current_y, f"{int(it.tax_rate)}%")
            c.drawRightString(185 * mm, current_y, f"{it.total_gross:.2f}")
            
            c.setLineWidth(0.1)
            c.line(20 * mm, current_y - 2*mm, 190 * mm, current_y - 2*mm)
            
            current_y -= 6 * mm
            idx += 1

            # Obsługa nowej strony
            if current_y < 40 * mm: 
                c.showPage()
                current_y = height - 20 * mm
                c.setFont(FONT_REGULAR_NAME, 9)
        
        return current_y

    # Rysowanie tabel(i)
    if is_correction and parent:
        # Tabela 1: Stan przed korektą (items z rodzica)
        parent_items = getattr(parent, "items", [])
        y = draw_items_table(y, "TREŚĆ KORYGOWANA (BYŁO):", parent_items)
        
        y -= 10 * mm
        
        # Tabela 2: Stan po korekcie (items z obecnej faktury)
        y = draw_items_table(y, "TREŚĆ PO KOREKCIE (JEST):", items)
    else:
        # Standardowa jedna tabela
        y = draw_items_table(y, "POZYCJE FAKTURY:", items)

    # --- 4. PODSUMOWANIE ---
    y -= 5 * mm
    # Sprawdzenie miejsca na podsumowanie
    if y < 40 * mm:
        c.showPage()
        y = height - 30 * mm

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