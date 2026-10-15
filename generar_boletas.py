import csv
import io
import secrets
from pathlib import Path

import qrcode
from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
OUTPUT = ROOT / "output"
PDF_PATH = OUTPUT / "boletas_festival_1000.pdf"
CSV_PATH = OUTPUT / "codigos_boletas.csv"

TICKET_TYPES = (
    ("Grupo 1", PUBLIC / "Boleto Festival de Danzas Colombianas.png"),
    ("Grupo 2", PUBLIC / "Boleto del Festival de Danzas Grupo 1.png"),
)
TICKETS_PER_TYPE = 500
TICKETS_PER_PAGE = 10
PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN_X = 0.35 * 72
MARGIN_Y = 0.45 * 72
GAP_X = 0.12 * 72
GAP_Y = 0.12 * 72
COLUMNS = 2
ROWS = TICKETS_PER_PAGE // COLUMNS
CELL_WIDTH = (PAGE_WIDTH - 2 * MARGIN_X - GAP_X) / COLUMNS
CELL_HEIGHT = (PAGE_HEIGHT - 2 * MARGIN_Y - GAP_Y * (ROWS - 1)) / ROWS
TICKET_WIDTH = min(CELL_WIDTH, CELL_HEIGHT * 2)
TICKET_HEIGHT = TICKET_WIDTH / 2


def make_qr_reader(token):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(token)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for _, template_path in TICKET_TYPES:
        if not template_path.is_file():
            raise FileNotFoundError(f"No se encontró la plantilla: {template_path}")

    pdf = canvas.Canvas(str(PDF_PATH), pagesize=letter, pageCompression=1)
    pdf.setTitle("Boletas Festival de Danzas Colombianas - 1000 boletas")
    pdf.setAuthor("Institución Educativa Integrado de Soacha")

    token_set = set()
    total_pages = 0
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(("grupo", "numero_boleta", "token_qr"))

        for group, template_path in TICKET_TYPES:
            with Image.open(template_path) as template:
                image_width, image_height = template.size
            qr_left = 0.866
            qr_top = 0.71
            qr_right = 0.991
            qr_bottom = 0.963
            qr_box_width = qr_right - qr_left
            qr_box_height = qr_bottom - qr_top
            qr_size = min(qr_box_width, qr_box_height * image_height / image_width)
            qr_padding = max(16, image_width // 100) / image_width
            qr_size -= qr_padding

            for first_number in range(1, TICKETS_PER_TYPE + 1, TICKETS_PER_PAGE):
                for offset in range(TICKETS_PER_PAGE):
                    number = first_number + offset
                    token = secrets.token_urlsafe(16)
                    if token in token_set:
                        raise RuntimeError("Se generó un token QR duplicado.")
                    token_set.add(token)
                    writer.writerow((group, f"{number:03d}", token))

                    column = offset % COLUMNS
                    row = offset // COLUMNS
                    x = MARGIN_X + column * (CELL_WIDTH + GAP_X) + (CELL_WIDTH - TICKET_WIDTH) / 2
                    y = PAGE_HEIGHT - MARGIN_Y - TICKET_HEIGHT - row * (TICKET_HEIGHT + GAP_Y)
                    pdf.drawImage(
                        str(template_path),
                        x,
                        y,
                        width=TICKET_WIDTH,
                        height=TICKET_HEIGHT,
                    )
                    qr_x = x + qr_left * TICKET_WIDTH + (qr_box_width - qr_size) * TICKET_WIDTH / 2
                    qr_y = y + (1 - qr_bottom) * TICKET_HEIGHT + (qr_box_height * TICKET_HEIGHT - qr_size * TICKET_WIDTH) / 2
                    qr_box_x = x + qr_left * TICKET_WIDTH
                    qr_box_y = y + (1 - qr_bottom) * TICKET_HEIGHT
                    pdf.setFillColor(HexColor("#FFFFFF"))
                    pdf.setStrokeColor(HexColor("#173E78"))
                    pdf.setLineWidth(0.45)
                    pdf.roundRect(
                        qr_box_x,
                        qr_box_y,
                        qr_box_width * TICKET_WIDTH,
                        qr_box_height * TICKET_HEIGHT,
                        3,
                        fill=1,
                        stroke=1,
                    )
                    pdf.drawImage(
                        make_qr_reader(token),
                        qr_x,
                        qr_y,
                        width=qr_size * TICKET_WIDTH,
                        height=qr_size * TICKET_WIDTH,
                    )

                    number_font_size = max(6, TICKET_WIDTH * 36 / image_width)
                    pdf.setFillColor(HexColor("#123D78"))
                    pdf.setFont("Helvetica-Bold", number_font_size)
                    pdf.drawCentredString(
                        x + 0.79 * TICKET_WIDTH,
                        y + (1 - 0.903) * TICKET_HEIGHT - number_font_size * 0.35,
                        f"{number:03d}",
                    )

                pdf.showPage()
                total_pages += 1

    if len(token_set) != 1000 or total_pages != 100:
        raise RuntimeError("La generación no produjo exactamente 1000 boletas en 100 páginas.")
    pdf.save()
    print(f"PDF: {PDF_PATH}")
    print(f"CSV: {CSV_PATH}")
    print(f"Boletas: {len(token_set)} (500 por grupo); páginas: {total_pages}")


if __name__ == "__main__":
    main()
