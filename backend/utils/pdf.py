from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def render_invoice_pdf(
    dest_path: Path,
    *,
    number: str,
    buyer_name: str,
    buyer_nip: str | None,
    buyer_address: str | None,
    items: list[dict],  # [{name, qty, price_net, tax_rate, total_net, total_gross}]
    total_net: float,
    total_vat: float,
    total_gross: float,
):
    c = canvas.Canvas(str(dest_path), pagesize=A4)
    width, height = A4
    y = height - 50

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"Faktura: {number}")
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Nabywca: {buyer_name}")
    y -= 14
    if buyer_nip:
        c.drawString(40, y, f"NIP: {buyer_nip}")
        y -= 14
    if buyer_address:
        c.drawString(40, y, f"Adres: {buyer_address}")
        y -= 20

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Pozycje:")
    y -= 16
    c.setFont("Helvetica", 9)
    for it in items:
        line = f"- {it.get('name','?')} | qty: {it['qty']} | net: {it['price_net']} | VAT%: {it['tax_rate']} | razem brutto: {it['total_gross']}"
        c.drawString(40, y, line)
        y -= 12
        if y < 80:
            c.showPage()
            y = height - 50
            c.setFont("Helvetica", 9)

    y -= 10
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, f"Suma netto: {total_net:.2f}  | VAT: {total_vat:.2f}  | Suma brutto: {total_gross:.2f}")

    c.showPage()
    c.save()
