"""Downloadable GA invoice, shared by previews and customer email attachments."""
from html import escape
from io import BytesIO
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from booking_pdf import ASSETS, GOLD, INK, PAPER
from dispatch_invoices import ENQUIRIES_EMAIL, bank_lines, invoice_dates, number, pounds, public_comments, uk_date
import json


def build(invoice, settings, card_link=""):
    result = BytesIO()
    code = number(invoice["id"])
    document = SimpleDocTemplate(result, pagesize=A4, leftMargin=40, rightMargin=40,
                                 topMargin=36, bottomMargin=36, title=f"GA Invoicing | {code}")

    def paragraph(text, size=10, colour=INK, font="Helvetica", right=False, markup=False):
        style = ParagraphStyle("invoice", fontName=font, fontSize=size, leading=size * 1.35,
                               textColor=colour, alignment=2 if right else 0)
        content = text if markup else escape(str(text or "")).replace("\n", "<br/>")
        return Paragraph(content, style)

    def table(rows, widths, background=None, header=False):
        sheet = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
        formatting = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 7),
                      ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                      ("RIGHTPADDING", (0, 0), (-1, -1), 10)]
        if background:
            formatting.append(("BACKGROUND", (0, 0), (-1, -1), background))
        if header:
            formatting += [("BACKGROUND", (0, 0), (-1, 0), PAPER),
                           ("LINEBELOW", (0, 0), (-1, -1), .3, colors.HexColor("#daddd6"))]
        sheet.setStyle(TableStyle(formatting))
        return sheet

    width = document.width
    logo = Image(str(ASSETS / "ga-logo.png"), width=164, height=48.6)
    logo.hAlign = "LEFT"
    banner = table([[logo, [paragraph("Invoice", 26, colors.white, "Times-Roman", True),
                           paragraph(code, 11, GOLD, right=True)]]], [width / 2, width / 2], INK)
    vat_number = settings.get("vat_number") or os.environ.get("GA_VAT_REGISTRATION", "")
    sender = [paragraph("GA Chauffeur Services Limited\n1 Glebe Road, Stanmore, HA7 4EJ", right=True),
              paragraph(f'<a href="mailto:{ENQUIRIES_EMAIL}" color="#366052"><u>{ENQUIRIES_EMAIL}</u></a>',
                        right=True, markup=True)]
    if vat_number and invoice["vat_pence"]:
        sender.append(paragraph("VAT registration " + vat_number, right=True))
    contact = "\n".join(filter(None, [invoice["client_name"], invoice["client_email"], invoice["client_address"]]))
    dates = invoice_dates(invoice)
    if invoice["paid"]:
        dates.append("Paid")
    details = table([[[paragraph("BILL TO", 9, font="Helvetica-Bold"), paragraph(contact)],
                      [*sender, Spacer(1, 6), paragraph("\n".join(dates), right=True)]]],
                    [width / 2, width / 2])
    charges = [[paragraph("Description", font="Helvetica-Bold"),
                *[paragraph(label, font="Helvetica-Bold", right=True) for label in ("Qty", "Rate", "Amount")]]]
    for line in json.loads(invoice["items"]):
        charges.append([paragraph(line["description"]), paragraph(line["quantity"], right=True),
                        paragraph(pounds(line["unit_pence"]), right=True), paragraph(pounds(line["amount_pence"]), right=True)])
    totals = [("Subtotal", invoice["subtotal_pence"])]
    if invoice["discount_pence"]:
        totals.append(("Discount", -invoice["discount_pence"]))
    if invoice["vat_pence"]:
        label = f"VAT ({invoice['vat_percent']}%)" if invoice["vat_percent"] else "VAT"
        totals.append((label, invoice["vat_pence"]))
    totals += [("Total", invoice["total_pence"]), ("Paid", invoice["paid_pence"])]
    if invoice["deducted_pence"]:
        totals.append(("Deductions", invoice["deducted_pence"]))
    totals.append(("Balance due", invoice["balance_pence"]))
    summary = table([[paragraph(label, font="Helvetica-Bold"), paragraph(pounds(amount), right=True)]
                     for label, amount in totals], [width - 124, 124], PAPER)
    ledger = [paragraph(f"{uk_date(row['noted_on'])} · {row['kind'].title()} · {pounds(row['amount_pence'])}" +
                        (f" · {row['memo']}" if row["memo"] else "")) for row in invoice.get("payments", [])]
    content = [banner, Spacer(1, 16), details, Spacer(1, 16),
               table(charges, [width - 217, 52, 80, 85], header=True), Spacer(1, 10), summary]
    if ledger:
        content.extend([Spacer(1, 12), paragraph("PAYMENTS AND DEDUCTIONS", 9, font="Helvetica-Bold"), *ledger])
    if comments := public_comments(invoice):
        content.extend([Spacer(1, 12), paragraph(comments)])
    if invoice["balance_pence"]:
        bank = bank_lines(settings)
        if bank:
            content.extend([Spacer(1, 12), paragraph("BANK TRANSFER", 9, font="Helvetica-Bold"), paragraph("\n".join(bank))])
        if card_link:
            content.extend([Spacer(1, 12), paragraph(f'<a href="{escape(card_link, quote=True)}" color="#ffffff">Pay by card</a>',
                            colour=colors.white, font="Helvetica-Bold", markup=True)])
            content[-1] = table([[content[-1]]], [120], INK)
    document.build(content)
    return result.getvalue()
