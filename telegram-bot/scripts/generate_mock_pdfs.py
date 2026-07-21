"""Generate fictional one-page PDFs used by the offline mock mode."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "mock_backend" / "files"
FONT = Path("C:/Windows/Fonts/arial.ttf")

DOCUMENTS = {
    "demo-itinerary.pdf": (
        "Демонстрационный маршрут",
        [
            ("Поездка", "Отпуск в Турции"),
            ("Маршрут", "Москва - Анталья"),
            ("Событие", "Рейс домой, демонстрационные данные"),
            ("Статус", "Подтверждено"),
        ],
    ),
    "demo-hotel-voucher.pdf": (
        "Демонстрационный ваучер отеля",
        [
            ("Отель", "Sunrise Beach (вымышленный)"),
            ("Город", "Анталья"),
            ("Гости", "Участники демонстрационной поездки"),
            ("Статус", "Подтверждено"),
        ],
    ),
    "demo-insurance.pdf": (
        "Демонстрационная страховка",
        [
            ("Программа", "Travel Demo"),
            ("Территория", "Турция"),
            ("Период", "Демонстрационный период"),
            ("Важно", "Не является страховым полисом"),
        ],
    ),
    "demo-personal-document.pdf": (
        "Демонстрационный личный документ",
        [
            ("Владелец", "Вымышленный участник"),
            ("Тип", "Учебный образец"),
            ("Данные", "Персональные сведения отсутствуют"),
            ("Важно", "Не является удостоверением личности"),
        ],
    ),
}


def draw_pdf(path: Path, title: str, rows: list[tuple[str, str]]) -> None:
    page_width, page_height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.setTitle(title)
    pdf.setAuthor("Тревел-помощник - mock mode")

    pdf.setFillColor(colors.HexColor("#173B3F"))
    pdf.rect(0, page_height - 150, page_width, 150, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Arial", 10)
    pdf.drawString(48, page_height - 52, "ТРЕВЕЛ-ПОМОЩНИК")
    pdf.setFont("Arial", 22)
    pdf.drawString(48, page_height - 92, title)
    pdf.setFont("Arial", 10)
    pdf.drawString(48, page_height - 119, "Безопасные вымышленные данные для демонстрации Telegram-бота")

    y = page_height - 200
    for label, value in rows:
        pdf.setFillColor(colors.HexColor("#607074"))
        pdf.setFont("Arial", 9)
        pdf.drawString(48, y, label.upper())
        pdf.setFillColor(colors.HexColor("#172B2E"))
        pdf.setFont("Arial", 12)
        pdf.drawString(48, y - 20, value)
        pdf.setStrokeColor(colors.HexColor("#D9E2E3"))
        pdf.line(48, y - 34, page_width - 48, y - 34)
        y -= 72

    pdf.setFillColor(colors.HexColor("#F2F7F7"))
    pdf.roundRect(48, 76, page_width - 96, 54, 8, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#35575B"))
    pdf.setFont("Arial", 9)
    pdf.drawString(64, 106, "DEMO ONLY")
    pdf.drawString(64, 88, "Документ не содержит реальных персональных данных и не имеет юридической силы.")
    pdf.showPage()
    pdf.save()


def main() -> None:
    if not FONT.is_file():
        raise SystemExit(f"Не найден Unicode-шрифт: {FONT}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Arial", str(FONT)))
    for filename, (title, rows) in DOCUMENTS.items():
        draw_pdf(OUTPUT / filename, title, rows)


if __name__ == "__main__":
    main()
