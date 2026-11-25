"""Branded PDF rendition of the Dispatch booking confirmation."""
from html import escape
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from journey_stops import load, split_return_stop

ASSETS = Path(__file__).parent / "website" / "assets"
INK = colors.HexColor("#17211c")
GOLD = colors.HexColor("#ceba8a")
PAPER = colors.HexColor("#f4f3ee")


def booking_confirmation(booking, amend_url, fare_rows, vehicle_image):
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42,
                                 topMargin=36, bottomMargin=36, title="GA Chauffeurs | Booking confirmation")

    def para(value, size=10, colour=INK, font="Helvetica"):
        style = ParagraphStyle("confirmation", fontName=font, fontSize=size, leading=size * 1.32,
                               textColor=colour)
        return Paragraph(escape(str(value or "")).replace("\n", "<br/>"), style)

    def table(rows, widths, background=PAPER):
        result = Table(rows, colWidths=widths, hAlign="LEFT")
        result.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        return result

    width = document.width
    logo = Image(str(ASSETS / "ga-logo.png"), width=180, height=53.3)
    logo.hAlign = "LEFT"
    header = table([[logo], [para("Booking confirmation", 29, colors.white, "Times-Roman")],
                    [para(f"{booking['confirmation_code']} · {booking['service_type']}", 11, GOLD)]], [width], INK)
    pickup = " · ".join(filter(None, (booking["pickup_address"], booking.get("pickup_unit"))))
    destination = " · ".join(filter(None, (booking["dropoff_address"], booking.get("dropoff_unit"))))
    stops, return_stop = split_return_stop(booking["pickup_address"], load(booking.get("stops")))
    itinerary = [[para("YOUR JOURNEY", 9, INK, "Helvetica-Bold"), para(booking["formatted_pickup"], 10)]]
    itinerary.append([para("Collection"), para(pickup)])
    itinerary.extend([para(f"Stop {index}"), para(stop)] for index, stop in enumerate(stops, 1))
    itinerary.append([para("Destination"), para(destination)])
    if return_stop:
        itinerary.append([para("Return stop"), para(return_stop)])
    if booking.get("flight_number"):
        itinerary.append([para("Flight"), para(booking["flight_number"])])

    vehicle_rows = [para("CHAUFFEUR & VEHICLE", 9, INK, "Helvetica-Bold"),
                    para(booking.get("chauffeur_name") or "Chauffeur details to follow", 17, INK, "Times-Roman"),
                    para(booking["vehicle_display_name"])]
    for key in ("license_plate", "chauffeur_phone"):
        if booking.get(key):
            vehicle_rows.append(para(booking[key]))
    vehicle_rows.append(para(f"{booking['passenger_count']} passengers · {booking['luggage_count']} bags"))
    car_path = ASSETS / "fleet" / vehicle_image
    car = Image(str(car_path), width=205, height=105, kind="proportional") if car_path.is_file() else ""
    body = [header, Spacer(1, 17), para(f"Dear {booking['customer_name']},", 12),
            para("Thank you for booking with GA Chauffeurs."), Spacer(1, 14),
            table(itinerary, [110, width - 110]), Spacer(1, 14),
            table([[vehicle_rows, car]], [width - 232, 232], colors.white), Spacer(1, 12)]
    if booking.get("special_requests"):
        body += [para("Special requests", 10, INK, "Helvetica-Bold"), para(booking["special_requests"]), Spacer(1, 12)]
    if fare_rows:
        body.append(table([[para("FARE SUMMARY", 9, INK, "Helvetica-Bold"), ""],
                          *[[para(label), para(f"£{amount:,.2f}")] for label, amount in fare_rows]],
                          [width - 110, 110]))
    else:
        body.append(para("Final charges are calculated after the journey."))
    link_style = ParagraphStyle("amend", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=colors.white)
    link = Paragraph(f'<a href="{escape(amend_url, quote=True)}" color="#ffffff">Amend booking</a>', link_style)
    body += [Spacer(1, 17), table([[link]], [138], INK), Spacer(1, 12),
             para("GA Chauffeur Services Limited · enquiries@gachauffeurs.co.uk", 9)]
    document.build(body)
    return output.getvalue()
