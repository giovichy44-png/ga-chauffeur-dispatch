"""
GA Chauffeur Services Limited - Dispatch & Fleet Management Server.
Company: GA Chauffeur Services Limited
Website: gachauffeurs.co.uk
Base Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
Direct Phone: +44 7886 622082
Enquiries Email: enquiries@gachauffeurs.co.uk
Fleet: Mercedes-Benz S-Class, Mercedes-Benz V-Class, Range Rover Autobiography LWB
"""

import sys
import os
import json
import sqlite3
import random
import math
import time
import threading
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import db

PORT = 8080
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# In-memory subscriber list for Server-Sent Events (SSE)
sse_clients = []
sse_lock = threading.Lock()

# Configuration
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "enquiries@gachauffeurs.co.uk")
COMPANY_NAME = "GA Chauffeur Services Limited"
COMPANY_WEBSITE = "https://gachauffeurs.co.uk"
COMPANY_PHONE = "+44 7886 622082"
COMPANY_ADDRESS = "1 Glebe Road, Stanmore, Greater London, HA7 4EJ"

# VEHICLE FLEET SPECIFICATIONS & PUBLISHED RATES FROM GACHAUFFEURS.CO.UK
VEHICLE_CONFIGS = {
    "mercedes_s_class": {
        "name": "Mercedes-Benz S-Class",
        "description": "Executive Saloon • Pure Elegance",
        "passengers": 4,
        "large_cases": 2,
        "medium_cases": 2,
        "hand_luggage": 2,
        "hourly_rate": 85.0,
        "min_hours": 2,
        "heathrow_rate": 165.0,        # Heathrow & London City Airport to Central London
        "outer_airports_rate": 305.0,  # Gatwick, Luton, Stansted, Farnborough, Biggin Hill
        "ten_hour_rate": 850.0,
        "twelve_hour_rate": 960.0,
        "excess_mile_rate": 4.00,
        "min_fare": 165.0
    },
    "mercedes_v_class": {
        "name": "Mercedes-Benz V-Class",
        "description": "Luxury MPV • 6-Passenger Luxury Cabin",
        "passengers": 6,
        "large_cases": 6,
        "medium_cases": 6,
        "hand_luggage": 6,
        "hourly_rate": 95.0,
        "min_hours": 2,
        "heathrow_rate": 175.0,        # Heathrow & London City Airport to Central London
        "outer_airports_rate": 315.0,  # Gatwick, Luton, Stansted, Farnborough, Biggin Hill
        "ten_hour_rate": 900.0,
        "twelve_hour_rate": 1080.0,
        "excess_mile_rate": 4.00,
        "min_fare": 175.0
    },
    "range_rover_autobiography": {
        "name": "Range Rover Autobiography LWB",
        "description": "Prestige Long Wheelbase Luxury 4x4",
        "passengers": 4,
        "large_cases": 3,
        "medium_cases": 2,
        "hand_luggage": 3,
        "hourly_rate": 115.0,
        "min_hours": 2,
        "heathrow_rate": 225.0,        # Heathrow & London City Airport to Central London
        "outer_airports_rate": 405.0,  # Gatwick, Luton, Stansted, Farnborough, Biggin Hill
        "ten_hour_rate": 1150.0,
        "twelve_hour_rate": 1380.0,
        "excess_mile_rate": 4.00,
        "min_fare": 225.0
    }
}

# UK AIRPORT TERMINALS & PRESTIGE LOCATIONS FOR INSTANT AUTOCOMPLETE
UK_AUTOCOMPLETE_DATABASE = [
    # Heathrow Terminals & VIP Suites (LHR, T5, etc.)
    {"title": "Heathrow Airport (LHR) Terminal 5", "subtitle": "Departures & Arrivals, TW6 2GA", "category": "airport", "code": "LHR"},
    {"title": "Heathrow Airport (LHR) Terminal 5 - Windsor Suite VIP", "subtitle": "Private Jetbridge VIP Facility, TW6 2GA", "category": "airport", "code": "LHR"},
    {"title": "Heathrow Airport (LHR) Terminal 2", "subtitle": "The Queen's Terminal, TW6 1EW", "category": "airport", "code": "LHR"},
    {"title": "Heathrow Airport (LHR) Terminal 3", "subtitle": "Departures & Arrivals, TW6 1QG", "category": "airport", "code": "LHR"},
    {"title": "Heathrow Airport (LHR) Terminal 4", "subtitle": "Departures & Arrivals, TW6 3XA", "category": "airport", "code": "LHR"},
    
    # Gatwick Terminals (LGW)
    {"title": "Gatwick Airport (LGW) South Terminal", "subtitle": "Departures & Arrivals, RH6 0NP", "category": "airport", "code": "LGW"},
    {"title": "Gatwick Airport (LGW) North Terminal", "subtitle": "Departures & Arrivals, RH6 0PJ", "category": "airport", "code": "LGW"},

    # London City Airport (LCY)
    {"title": "London City Airport (LCY)", "subtitle": "Royal Docks, Hartmann Road, London E16 2PB", "category": "airport", "code": "LCY"},
    {"title": "London City Airport (LCY) Jet Centre", "subtitle": "Private Aviation Terminal, E16 2PB", "category": "airport", "code": "LCY"},

    # Farnborough Airport (FAB)
    {"title": "Farnborough Airport (FAB)", "subtitle": "Signature Aviation / TAG FBO, GU14 6XA", "category": "airport", "code": "FAB"},

    # London Luton Airport (LTN)
    {"title": "London Luton Airport (LTN)", "subtitle": "Main Passenger Terminal, LU2 9LY", "category": "airport", "code": "LTN"},
    {"title": "London Luton Airport (LTN) Signature Aviation", "subtitle": "Private Jet FBO, LU2 9NW", "category": "airport", "code": "LTN"},
    {"title": "London Luton Airport (LTN) Harrods Aviation", "subtitle": "VIP Private Terminal, LU2 9PF", "category": "airport", "code": "LTN"},

    # London Stansted Airport (STN)
    {"title": "London Stansted Airport (STN)", "subtitle": "Main Passenger Terminal, CM24 1QW", "category": "airport", "code": "STN"},
    {"title": "London Stansted Airport (STN) Inflite Jet Centre", "subtitle": "Private VIP Aviation, CM24 1RY", "category": "airport", "code": "STN"},

    # London Biggin Hill Airport (BQH)
    {"title": "London Biggin Hill Airport (BQH)", "subtitle": "Executive Handling Terminal, TN16 3BN", "category": "airport", "code": "BQH"},

    # RAF Northolt (NHT)
    {"title": "RAF Northolt (NHT)", "subtitle": "VIP & Military Aviation Handling, HA4 6NG", "category": "airport", "code": "NHT"},

    # Luxury London Hotels & Landmarks
    {"title": "The Connaught", "subtitle": "Carlos Place, Mayfair, London W1K 2AL", "category": "hotel"},
    {"title": "The Dorchester", "subtitle": "53 Park Lane, Mayfair, London W1K 1QA", "category": "hotel"},
    {"title": "The Ritz London", "subtitle": "150 Piccadilly, St. James's, London W1J 9BR", "category": "hotel"},
    {"title": "The Savoy", "subtitle": "Strand, London WC2R 0EZ", "category": "hotel"},
    {"title": "Claridge's", "subtitle": "Brook Street, Mayfair, London W1K 4HR", "category": "hotel"},
    {"title": "Rosewood London", "subtitle": "252 High Holborn, London WC1V 7EN", "category": "hotel"},
    {"title": "The Berkeley", "subtitle": "Wilton Place, Knightsbridge, London SW1X 7RL", "category": "hotel"},
    {"title": "Harrods", "subtitle": "87-135 Brompton Rd, Knightsbridge, London SW1X 7XL", "category": "landmark"},
    {"title": "One Canada Square", "subtitle": "Canary Wharf, London E14 5AA", "category": "business"},
    {"title": "1 Glebe Road", "subtitle": "Stanmore, Greater London HA7 4EJ", "category": "base"}
]

# Compatibility aliases
VEHICLE_ALIASES = {
    "first_class": "mercedes_s_class",
    "business_sedan": "mercedes_s_class",
    "luxury_van": "mercedes_v_class",
    "executive_suv": "range_rover_autobiography"
}

def normalize_vehicle_tier(tier_key):
    tier = str(tier_key).lower().strip()
    return VEHICLE_ALIASES.get(tier, tier if tier in VEHICLE_CONFIGS else "mercedes_s_class")

def detect_service_type(pickup="", dropoff="", requested_type=None):
    """
    Intelligently detects whether a journey is an Airport arrival, Airport departure,
    Hourly chauffeur service, or Point-to-point transfer.
    """
    if requested_type and "hourly" in str(requested_type).lower():
        return "Hourly chauffeur service"
    
    text = f"{pickup} {dropoff}".lower()
    airport_kws = [
        "heathrow", "lhr", "t5", "t2", "t3", "t4", "terminal 5", "terminal 2", "terminal 3", "terminal 4",
        "gatwick", "lgw", "city airport", "lcy", "london city", "luton", "ltn",
        "stansted", "stn", "farnborough", "fab", "biggin hill", "bqh", "northolt",
        "airport", "terminal", "fbo", "aerodrome"
    ]
    
    is_airport = any(kw in text for kw in airport_kws)
    if is_airport:
        p_text = str(pickup).lower()
        if any(kw in p_text for kw in airport_kws):
            return "Airport arrival"
        return "Airport departure"
    return "Point-to-point transfer"

def calculate_fare(vehicle_class, service_type=None, pickup="", dropoff="", hours=0, distance_mi=15.0):
    """
    Calculate executive luxury pricing in GBP (£) based on GA Chauffeur Services Limited published structure.
    - Heathrow / London City Airport: S-Class £165 + VAT, V-Class £175 + VAT, Range Rover £225 + VAT
    - Gatwick / Luton / Stansted / Farnborough: S-Class £305 + VAT, V-Class £315 + VAT, Range Rover £405 + VAT
    - Hourly: S-Class £85/hr (min 2 hrs = £170 + VAT), V-Class £95/hr (min 2 hrs = £190 + VAT), Range Rover £115/hr (min 2 hrs = £230 + VAT)
    - Point-to-point: minimum 2 hours base, £4/mile excess.
    - VAT: 20%
    """
    key = normalize_vehicle_tier(vehicle_class)
    cfg = VEHICLE_CONFIGS.get(key, VEHICLE_CONFIGS["mercedes_s_class"])
    
    detected = detect_service_type(pickup, dropoff, service_type)
    final_type = service_type or detected
    
    hours_int = int(hours or 0)
    
    if "hourly" in final_type.lower() or hours_int > 0:
        h = max(2, hours_int if hours_int > 0 else 2)
        if h == 10:
            net_fare = cfg["ten_hour_rate"]
        elif h == 12:
            net_fare = cfg["twelve_hour_rate"]
        else:
            net_fare = h * cfg["hourly_rate"]
        service_label = f"Hourly Chauffeur Service ({h} Hours)"
    else:
        text = f"{pickup} {dropoff}".lower()
        heathrow_city_kws = ["heathrow", "lhr", "t5", "t2", "t3", "t4", "city airport", "lcy", "london city"]
        outer_airports_kws = ["gatwick", "lgw", "luton", "ltn", "stansted", "stn", "farnborough", "fab", "biggin hill", "bqh"]
        
        if any(kw in text for kw in heathrow_city_kws) or "lhr" in text or "heathrow" in text:
            net_fare = cfg["heathrow_rate"]
            service_label = "Heathrow / London City Airport Transfer"
        elif any(kw in text for kw in outer_airports_kws):
            net_fare = cfg["outer_airports_rate"]
            service_label = "Gatwick / Luton / Stansted / Farnborough Transfer"
        elif "airport" in text or "terminal" in text or "fbo" in text:
            net_fare = cfg["heathrow_rate"]
            service_label = "Airport Transfer"
        else:
            # Point-to-point
            base_p2p = cfg["hourly_rate"] * 2.0
            excess_mi = max(0.0, float(distance_mi) - 20.0)
            net_fare = base_p2p + (excess_mi * cfg["excess_mile_rate"])
            service_label = "Point-to-Point Transfer"

    net_fare = round(net_fare, 2)
    vat_amount = round(net_fare * 0.20, 2)
    total_fare = round(net_fare + vat_amount, 2)
    
    return {
        "net_fare": net_fare,
        "vat_amount": vat_amount,
        "total_fare": total_fare,
        "fare_amount": net_fare,
        "service_type": detected,
        "service_label": service_label,
        "disclaimer": "Parking, airport drop-off, and Congestion Charge are extra and will be added where applicable."
    }

def generate_confirmation_code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(random.choices(chars, k=5))
    return f"GA-{suffix}"

def broadcast_event(event_type, data):
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with sse_lock:
        stale_clients = []
        for client in sse_clients:
            try:
                client.wfile.write(payload.encode("utf-8"))
                client.wfile.flush()
            except Exception:
                stale_clients.append(client)
        for client in stale_clients:
            if client in sse_clients:
                sse_clients.remove(client)

def send_smtp_email(to_email, subject, html_content, text_content=""):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        return True, "Simulated delivery (SMTP credentials not configured)"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{COMPANY_NAME} <{FROM_EMAIL}>"
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain"))
        if html_content:
            msg.attach(MIMEText(html_content, "html"))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        server.quit()
        return True, "Delivered via live SMTP"
    except Exception as e:
        sys.stderr.write(f"[SMTP Error] Failed to send email to {to_email}: {e}\n")
        return False, str(e)

def build_luxury_email_html(booking_ref, customer_name, pickup_addr, dropoff_addr, pickup_dt, vehicle_tier, net_fare=None, fare_amt=None, vat_amt=None, total_fare=None, service_type="Airport Transfer", passengers=1, large_cases=0, medium_cases=0, hand_luggage=0, chauffeur=None, flight=None):
    tier_key = normalize_vehicle_tier(vehicle_tier)
    vehicle_info = VEHICLE_CONFIGS.get(tier_key, VEHICLE_CONFIGS["mercedes_s_class"])

    if net_fare is None and fare_amt is not None:
        net_fare = float(fare_amt)
    elif net_fare is None:
        net_fare = 165.0

    net_fare = float(net_fare)
    if vat_amt is None:
        vat_amt = round(net_fare * 0.20, 2)
    if total_fare is None:
        total_fare = round(net_fare + float(vat_amt), 2)

    driver_block = ""
    if chauffeur:
        driver_block = f"""
        <div style="background-color: #171f1b; border: 1px solid #c9b894; border-radius: 6px; padding: 18px; margin: 20px 0;">
          <h3 style="color: #c9b894; margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: .15em; font-family: Georgia, serif;">Allocated Chauffeur Details</h3>
          <p style="margin: 4px 0; color: #ffffff; font-size: 15px;"><strong>{chauffeur['name']}</strong> ({chauffeur.get('rating', 5.0)}★)</p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Vehicle: <span style="color: #fff;">{chauffeur['vehicle_model']}</span></p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Registration Plate: <span style="color: #c9b894; font-weight: bold; font-family: monospace;">{chauffeur['license_plate']}</span></p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Direct Contact: <a href="tel:{chauffeur['phone']}" style="color: #c9b894; text-decoration: none;">{chauffeur['phone']}</a></p>
        </div>
        """

    flight_block = ""
    if flight:
        flight_block = f"""
        <div style="background: rgba(56,189,248,0.08); border-left: 3px solid #38bdf8; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #cbd5e1;">
          <strong style="color: #38bdf8;">Flight Monitoring:</strong> {flight} — 45 minutes complimentary waiting time commences after flight landing.
        </div>
        """

    luggage_summary = f"{large_cases} Large, {medium_cases} Medium, {hand_luggage} Hand Luggage" if (large_cases or medium_cases or hand_luggage) else "Standard Luggage"

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Booking Confirmation {booking_ref} - GA Chauffeur Services Limited</title>
    </head>
    <body style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #121715; color: #edf0ea; margin: 0; padding: 24px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #171f1b; border: 1px solid #2e3b33; border-radius: 8px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
        
        <!-- Header Monogram -->
        <tr>
          <td style="background-color: #121715; padding: 28px 40px; text-align: center; border-bottom: 2px solid #c9b894;">
            <div style="display: inline-block;">
              <span style="font-family: Georgia, serif; font-size: 34px; letter-spacing: -4px; color: #c9b894; line-height: 1;">GA</span>
              <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #3e4e44; padding-left: 14px; margin-left: 10px; color: #d0d8d1; line-height: 1.4; display: inline-block; vertical-align: middle; text-align: left;">Chauffeur<br>Services</span>
            </div>
            <p style="color: #c9b894; font-size: 11px; margin: 10px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">gachauffeurs.co.uk • Official Reservation</p>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding: 36px 40px;">
            <span style="background-color: rgba(201, 184, 148, 0.12); color: #c9b894; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 3px; text-transform: uppercase; letter-spacing: .12em; border: 1px solid rgba(201, 184, 148, 0.3);">Booking Confirmed</span>
            <h2 style="font-family: Georgia, serif; color: #ffffff; font-size: 22px; font-weight: normal; margin: 16px 0 8px 0;">Dear {customer_name},</h2>
            <p style="color: #aab5ae; font-size: 14px; line-height: 1.6; margin-top: 0;">
              Thank you for choosing <strong>GA Chauffeur Services Limited</strong>. Your private luxury transfer has been registered in our central dispatch console.
            </p>

            <table width="100%" style="background-color: #121715; border-radius: 6px; padding: 18px; margin: 24px 0; border: 1px solid #2e3b33;">
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600;">Booking Reference</td>
                <td style="text-align: right; color: #c9b894; font-size: 18px; font-weight: bold; font-family: 'JetBrains Mono', monospace;">{booking_ref}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Service Type</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 10px;">{service_type}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Pickup Date &amp; Time</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 10px;">{pickup_dt}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Vehicle Selected</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 10px; font-weight: 600;">{vehicle_info['name']}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Passengers &amp; Luggage</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 10px;">{passengers} Pax • {luggage_summary}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 1px solid #2e3b33; padding-top: 12px; margin-top: 12px;"></td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px;">Net Fare</td>
                <td style="text-align: right; color: #ffffff; font-size: 14px;">£{net_fare:.2f} GBP</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px;">VAT (20%)</td>
                <td style="text-align: right; color: #ffffff; font-size: 14px;">£{vat_amt:.2f} GBP</td>
              </tr>
              <tr>
                <td style="color: #c9b894; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding-top: 8px;">Total Fare</td>
                <td style="text-align: right; color: #c9b894; font-size: 20px; font-weight: bold; padding-top: 8px; font-family: Georgia, serif;">£{total_fare:.2f} GBP</td>
              </tr>
            </table>

            <div style="background-color: #121715; border-left: 3px solid #c9b894; padding: 14px 18px; margin: 20px 0; border-radius: 0 4px 4px 0;">
              <div style="margin-bottom: 10px;">
                <span style="color: #c9b894; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em;">Collection Point</span>
                <div style="color: #ffffff; font-size: 14px; margin-top: 2px;">{pickup_addr}</div>
              </div>
              <div>
                <span style="color: #38bdf8; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em;">Destination</span>
                <div style="color: #ffffff; font-size: 14px; margin-top: 2px;">{dropoff_addr}</div>
              </div>
            </div>

            {flight_block}
            {driver_block}

            <!-- Important Terms & Additional Charges Disclaimer -->
            <div style="background: rgba(255,255,255,0.02); border: 1px solid #2e3b33; border-radius: 4px; padding: 14px 16px; margin: 22px 0; font-size: 12px; color: #aab5ae; line-height: 1.6;">
              <strong style="color: #edf0ea;">Additional Charges Note:</strong> Parking, airport drop-off fee and London Congestion Charge will be added where applicable and included in your final settlement.<br>
              <strong>Airport Waiting Policy:</strong> For airport arrivals, 45 minutes complimentary waiting time commences after flight landing. For departures, 15 minutes complimentary waiting time is provided.
            </div>

            <p style="color: #aab5ae; font-size: 13px; line-height: 1.6;">
              Your dedicated chauffeur will arrive with complimentary high-speed in-vehicle Wi-Fi, bottled chilled mineral water, and phone charging facilities.
            </p>

            <div style="text-align: center; margin-top: 28px;">
              <a href="{COMPANY_WEBSITE}" style="background: #c9b894; color: #171f1b; text-decoration: none; font-weight: 600; font-size: 13px; padding: 12px 28px; border-radius: 4px; display: inline-block;">
                Visit GA Chauffeurs ↗
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #121715; padding: 22px 40px; text-align: center; border-top: 1px solid #2e3b33; color: #717d76; font-size: 12px; line-height: 1.6;">
            <strong style="color: #edf0ea;">GA Chauffeur Services Limited</strong><br>
            Stanmore, Greater London • Company No: 11136878<br>
            Direct Phone: <a href="tel:{COMPANY_PHONE}" style="color: #c9b894; text-decoration: none;">{COMPANY_PHONE}</a> • Email: <a href="mailto:{FROM_EMAIL}" style="color: #c9b894; text-decoration: none;">{FROM_EMAIL}</a><br>
            Website: <a href="{COMPANY_WEBSITE}" style="color: #c9b894; text-decoration: none;">gachauffeurs.co.uk</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

class DispatchRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]} {args[1]}\n")

    def send_json(self, data, status_code=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/events":
            self.handle_sse()
            return

        if path == "/api/bookings":
            self.handle_get_bookings(query)
            return

        if path.startswith("/api/bookings/"):
            booking_id = path.split("/")[3]
            self.handle_get_booking(booking_id)
            return

        if path == "/api/chauffeurs":
            self.handle_get_chauffeurs(query)
            return

        if path == "/api/confirmations":
            self.handle_get_confirmations()
            return

        if path == "/api/actions":
            self.handle_get_action_logs()
            return

        if path == "/api/stats":
            self.handle_get_stats()
            return

        if path == "/api/fleet-config":
            self.send_json({"vehicles": VEHICLE_CONFIGS})
            return

        if path == "/api/quote":
            vehicle = query.get("vehicle", ["mercedes_s_class"])[0]
            pickup = query.get("pickup", [""])[0]
            dropoff = query.get("dropoff", [""])[0]
            service_type = query.get("service_type", [None])[0]
            hours = query.get("hours", [0])[0]
            distance = float(query.get("distance", [15.0])[0])
            fare_info = calculate_fare(vehicle, service_type, pickup, dropoff, hours, distance)
            self.send_json(fare_info)
            return

        if path == "/api/suggestions":
            q = query.get("q", [""])[0].strip().lower()
            if not q:
                # Return popular top airports and destinations
                self.send_json({"suggestions": UK_AUTOCOMPLETE_DATABASE[:10]})
                return

            results = []
            for item in UK_AUTOCOMPLETE_DATABASE:
                title = item["title"].lower()
                subtitle = item["subtitle"].lower()
                code = item.get("code", "").lower()

                # Priority scoring
                score = 0
                if q == code or q == "t5" and "terminal 5" in title:
                    score = 100
                elif q in code or q in title:
                    score = 50
                elif q in subtitle:
                    score = 20

                if score > 0:
                    results.append((score, item))

            results.sort(key=lambda x: x[0], reverse=True)
            matched = [item for _, item in results]
            self.send_json({"suggestions": matched[:12], "query": q})
            return

        if path == "/api/lookup-postcode":
            pc = query.get("postcode", [""])[0].strip().upper().replace(" ", "")
            # Return town / locality heuristics
            matched_town = "Greater London"
            if pc.startswith("TW6"):
                matched_town = "Heathrow Airport, Hounslow"
            elif pc.startswith("RH6"):
                matched_town = "Gatwick Airport, Horley"
            elif pc.startswith("HA7"):
                matched_town = "Stanmore, Greater London"
            elif pc.startswith("W1K") or pc.startswith("W1J"):
                matched_town = "Mayfair, Central London"
            elif pc.startswith("SW1"):
                matched_town = "Westminster / Belgravia, London"
            elif pc.startswith("E14"):
                matched_town = "Canary Wharf, London"
            elif pc.startswith("E16"):
                matched_town = "London City Airport / Royal Docks"
            elif pc.startswith("GU14"):
                matched_town = "Farnborough Airport, Hampshire"
            elif pc.startswith("LU2"):
                matched_town = "Luton Airport, Bedfordshire"
            elif pc.startswith("CM24"):
                matched_town = "Stansted Airport, Essex"

            self.send_json({
                "postcode": pc,
                "locality": matched_town,
                "suggestions": [
                    f"Unit / House Number, {matched_town}, {pc}",
                    f"Main Entrance, {matched_town}, {pc}"
                ]
            })
            return

        if path == "/manifest.json":
            self.handle_serve_manifest()
            return

        if path == "/sw.js":
            self.handle_serve_sw()
            return

        if path == "/" or path == "":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            payload = {}

        if path == "/api/bookings":
            self.handle_create_booking(payload)
            return

        if path.endswith("/allocate"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_allocate_chauffeur(booking_id, payload)
            return

        if path.endswith("/action"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_live_action(booking_id, payload)
            return

        if path == "/api/confirmations/resend":
            self.handle_resend_confirmation(payload)
            return

        if path == "/api/chauffeurs/status":
            self.handle_update_chauffeur_status(payload)
            return

        if path == "/api/simulate/tick":
            self.handle_simulation_tick()
            return

        if path == "/api/reset":
            db.seed_data(force=True)
            broadcast_event("system_reset", {"message": "Database reset to initial demo state"})
            self.send_json({"success": True, "message": "System reset to demo baseline."})
            return

        self.send_json({"error": "Endpoint not found"}, 404)

    def handle_serve_manifest(self):
        manifest = {
            "name": "GA Chauffeur Services",
            "short_name": "GA Chauffeurs",
            "description": "Executive Dispatch & Fleet Operations - gachauffeurs.co.uk",
            "start_url": "/?source=pwa",
            "display": "standalone",
            "background_color": "#090c10",
            "theme_color": "#d4af37",
            "orientation": "portrait-primary",
            "icons": [
                {
                    "src": "icon-192.png",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": "icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any maskable"
                }
            ]
        }
        body = json.dumps(manifest).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/manifest+json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_serve_sw(self):
        sw_code = """
        const CACHE_NAME = 'ga-chauffeurs-v2';
        self.addEventListener('install', (e) => self.skipWaiting());
        self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
        self.addEventListener('fetch', (e) => {
            e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        });
        """
        body = sw_code.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        with sse_lock:
            sse_clients.append(self)

        try:
            self.wfile.write(b"event: connected\ndata: {\"status\":\"connected\",\"company\":\"GA Chauffeur Services Limited\"}\n\n")
            self.wfile.flush()
        except Exception:
            with sse_lock:
                if self in sse_clients:
                    sse_clients.remove(self)
            return

        try:
            while True:
                time.sleep(20)
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except Exception:
            with sse_lock:
                if self in sse_clients:
                    sse_clients.remove(self)

    def handle_get_bookings(self, query):
        status_filter = query.get("status", ["ALL"])[0].upper()
        conn = db.get_connection()
        cursor = conn.cursor()

        sql = """
        SELECT b.*, 
               c.name as chauffeur_name, c.phone as chauffeur_phone, 
               c.vehicle_model, c.license_plate, c.rating as chauffeur_rating,
               c.lat as chauffeur_lat, c.lng as chauffeur_lng
        FROM bookings b
        LEFT JOIN chauffeurs c ON b.chauffeur_id = c.id
        """
        params = []
        if status_filter != "ALL":
            if status_filter == "ACTIVE":
                sql += " WHERE b.status IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_BOARD')"
            else:
                sql += " WHERE b.status = ?"
                params.append(status_filter)

        sql += " ORDER BY b.created_at DESC"
        cursor.execute(sql, params)
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        self.send_json({"bookings": rows, "count": len(rows)})

    def handle_get_booking(self, booking_id):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT b.*, 
               c.name as chauffeur_name, c.phone as chauffeur_phone, 
               c.vehicle_model, c.license_plate, c.rating as chauffeur_rating,
               c.lat as chauffeur_lat, c.lng as chauffeur_lng
        FROM bookings b
        LEFT JOIN chauffeurs c ON b.chauffeur_id = c.id
        WHERE b.id = ?
        """, (booking_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(row)

        cursor.execute("SELECT * FROM confirmations WHERE booking_id = ? ORDER BY sent_at DESC", (booking_id,))
        confirmations = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM action_logs WHERE booking_id = ? ORDER BY id DESC", (booking_id,))
        logs = [dict(r) for r in cursor.fetchall()]

        conn.close()
        self.send_json({"booking": booking, "confirmations": confirmations, "actions": logs})

    def handle_create_booking(self, payload):
        # Normalize field names to accept both dispatch schema and website form submissions
        if "customer_name" not in payload and "name" in payload:
            payload["customer_name"] = payload["name"]
        if "customer_phone" not in payload and "phone" in payload:
            payload["customer_phone"] = payload["phone"]
        if "customer_email" not in payload and "email" in payload:
            payload["customer_email"] = payload["email"]
        if "pickup_address" not in payload and "pickup" in payload:
            payload["pickup_address"] = payload["pickup"]
        if "dropoff_address" not in payload:
            payload["dropoff_address"] = payload.get("destination") or payload.get("dropoff") or ("As directed" if "hourly" in str(payload.get("service_type","")).lower() else "")
        if "pickup_datetime" not in payload and "datetime" in payload:
            payload["pickup_datetime"] = str(payload["datetime"]).replace("T", " ")
        if "vehicle_class" not in payload and "vehicle" in payload:
            payload["vehicle_class"] = payload["vehicle"]
        if "passenger_count" not in payload and "passengers" in payload:
            payload["passenger_count"] = payload["passengers"]

        required = ["customer_name", "customer_phone", "customer_email", "pickup_address", "dropoff_address", "pickup_datetime", "vehicle_class"]
        for field in required:
            if not payload.get(field):
                self.send_json({"error": f"Missing required field: {field}"}, 400)
                return

        conn = db.get_connection()
        cursor = conn.cursor()

        booking_id = f"BK-{random.randint(1000, 9999)}"
        code = generate_confirmation_code()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        source = payload.get("source", "WEBSITE_GACHAUFFEURS" if "website" in str(payload.get("source", "")).lower() else "DISPATCH_PORTAL")

        pickup_lat = float(payload.get("pickup_lat", 51.5074 + (random.random() - 0.5) * 0.08))
        pickup_lng = float(payload.get("pickup_lng", -0.1278 + (random.random() - 0.5) * 0.08))
        dropoff_lat = float(payload.get("dropoff_lat", 51.4700 + (random.random() - 0.5) * 0.08))
        dropoff_lng = float(payload.get("dropoff_lng", -0.4543 + (random.random() - 0.5) * 0.08))

        dlat = (dropoff_lat - pickup_lat) * 69.0
        dlng = (dropoff_lng - pickup_lng) * 43.0
        calculated_dist = max(round(math.sqrt(dlat*dlat + dlng*dlng), 1), 3.0)
        calculated_dur = int(calculated_dist * 2.4 + 10)

        distance_mi = float(payload.get("estimated_distance_mi", calculated_dist))
        duration_min = int(payload.get("estimated_duration_min", calculated_dur))

        normalized_vehicle = normalize_vehicle_tier(payload["vehicle_class"])
        
        # Service type detection & fare computation
        detected_service = detect_service_type(payload["pickup_address"], payload["dropoff_address"], payload.get("service_type"))
        service_type = payload.get("service_type") or detected_service
        hours_booked = int(payload.get("hours_booked", payload.get("hours", 0)) or 0)
        
        fare_result = calculate_fare(
            vehicle_class=normalized_vehicle,
            service_type=service_type,
            pickup=payload["pickup_address"],
            dropoff=payload["dropoff_address"],
            hours=hours_booked,
            distance_mi=distance_mi
        )
        
        net_fare = fare_result["net_fare"]
        vat_amount = fare_result["vat_amount"]
        total_fare = fare_result["total_fare"]

        flight_num = payload.get("flight_number")
        flight_status = "Airport Monitoring Active (45m free wait)" if flight_num else None

        pickup_unit = payload.get("pickup_unit", "")
        dropoff_unit = payload.get("dropoff_unit", "")
        large_cases = int(payload.get("large_cases", 0) or 0)
        medium_cases = int(payload.get("medium_cases", 0) or 0)
        hand_luggage = int(payload.get("hand_luggage", 0) or 0)
        passenger_count = int(payload.get("passenger_count", payload.get("passengers", 1)) or 1)
        luggage_count = int(payload.get("luggage_count", large_cases + medium_cases) or 1)

        cursor.execute("""
        INSERT INTO bookings (
            id, confirmation_code, customer_name, customer_phone, customer_email, vip_level,
            service_type, pickup_address, pickup_unit, pickup_lat, pickup_lng,
            dropoff_address, dropoff_unit, dropoff_lat, dropoff_lng,
            pickup_datetime, hours_booked, flight_number, flight_status, vehicle_class,
            passenger_count, luggage_count, large_cases, medium_cases, hand_luggage,
            special_requests, estimated_distance_mi, estimated_duration_min,
            fare_amount, vat_amount, total_fare, currency, source, status, chauffeur_id,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            booking_id, code, payload["customer_name"], payload["customer_phone"], payload["customer_email"],
            payload.get("vip_level", "Executive"), service_type, payload["pickup_address"], pickup_unit,
            pickup_lat, pickup_lng, payload["dropoff_address"], dropoff_unit, dropoff_lat, dropoff_lng,
            payload["pickup_datetime"], hours_booked, flight_num, flight_status, normalized_vehicle,
            passenger_count, luggage_count, large_cases, medium_cases, hand_luggage,
            payload.get("special_requests", ""), distance_mi, duration_min,
            net_fare, vat_amount, total_fare, "GBP", source, "CONFIRMED", None, now_str, now_str
        ))

        vehicle_name = VEHICLE_CONFIGS[normalized_vehicle]["name"]
        email_subject = f"Booking Confirmation: {code} - GA Chauffeur Services Limited"
        html_email = build_luxury_email_html(
            booking_ref=code,
            customer_name=payload["customer_name"],
            pickup_addr=payload["pickup_address"] + (f" ({pickup_unit})" if pickup_unit else ""),
            dropoff_addr=payload["dropoff_address"] + (f" ({dropoff_unit})" if dropoff_unit else ""),
            pickup_dt=payload["pickup_datetime"],
            vehicle_tier=normalized_vehicle,
            net_fare=net_fare,
            vat_amt=vat_amount,
            total_fare=total_fare,
            service_type=service_type,
            passengers=passenger_count,
            large_cases=large_cases,
            medium_cases=medium_cases,
            hand_luggage=hand_luggage,
            flight=flight_num
        )

        plain_text_email = (
            f"Dear {payload['customer_name']},\n\n"
            f"Thank you for choosing GA Chauffeur Services Limited (gachauffeurs.co.uk).\n"
            f"Your private chauffeur booking has been confirmed.\n\n"
            f"Booking Reference: {code}\n"
            f"Service Type: {service_type}\n"
            f"Pickup: {payload['pickup_address']} at {payload['pickup_datetime']}\n"
            f"Destination: {payload['dropoff_address']}\n"
            f"Vehicle: {vehicle_name}\n"
            f"Passengers: {passenger_count} | Luggage: {large_cases} Large, {medium_cases} Medium, {hand_luggage} Hand\n"
            + (f"Flight Monitoring: {flight_num} (Complimentary 45m waiting time included)\n" if flight_num else "")
            + (f"Special Requirements: {payload.get('special_requests')}\n" if payload.get('special_requests') else "")
            + f"Net Fare: £{net_fare:.2f} GBP\n"
            + f"VAT (20%): £{vat_amount:.2f} GBP\n"
            + f"Total Fare: £{total_fare:.2f} GBP\n\n"
            f"Please note: Parking, airport drop-off, and Congestion Charge will be added where applicable.\n\n"
            f"We will allocate your executive chauffeur shortly. You will receive driver contact details and vehicle tracking prior to departure.\n\n"
            f"GA Chauffeur Services Limited\n"
            f"Website: {COMPANY_WEBSITE}\n"
            f"Direct Phone: {COMPANY_PHONE}\n"
            f"Email: {FROM_EMAIL}"
        )

        send_success, delivery_note = send_smtp_email(payload["customer_email"], email_subject, html_email, plain_text_email)
        cnf_email_id = f"CNF-{random.randint(1000, 9999)}"

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_email_id, booking_id, "EMAIL", payload["customer_email"],
            email_subject, plain_text_email, "DELIVERED", now_str
        ))

        cnf_sms_id = f"CNF-{random.randint(1000, 9999)}"
        sms_content = (
            f"GA Chauffeurs: Confirmed booking {code} for {payload['customer_name']}. "
            f"Vehicle: {vehicle_name}. Pickup: {payload['pickup_datetime']} at {payload['pickup_address']}. "
            f"Track & Details: https://gachauffeurs.co.uk/track/{code}"
        )

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_sms_id, booking_id, "SMS", payload["customer_phone"],
            f"GA Chauffeurs Booking {code}", sms_content, "DELIVERED", now_str
        ))

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            booking_id, None, "BOOKING_CREATED", f"{'Website (gachauffeurs.co.uk)' if source == 'WEBSITE_GACHAUFFEURS' else 'Dispatch Console'}",
            f"Booking {code} received for {payload['customer_name']}. Confirmation email ({payload['customer_email']}) & SMS dispatched.",
            now_str
        ))

        conn.commit()
        conn.close()

        result = {
            "id": booking_id,
            "confirmation_code": code,
            "reference_number": code,
            "vehicle_name": vehicle_name,
            "net_fare": net_fare,
            "vat_amount": vat_amount,
            "total_fare": total_fare,
            "fare_amount": net_fare,
            "service_type": service_type,
            "currency": "GBP",
            "distance_mi": distance_mi,
            "duration_min": duration_min,
            "status": "CONFIRMED",
            "email_dispatched_to": payload["customer_email"],
            "confirmations": [cnf_email_id, cnf_sms_id],
            "delivery_note": delivery_note
        }

        broadcast_event("booking_created", result)
        self.send_json({"success": True, "booking": result, "message": f"Job {code} created and confirmation email sent to {payload['customer_email']}."}, 201)

    def handle_allocate_chauffeur(self, booking_id, payload):
        chauffeur_id = payload.get("chauffeur_id")
        conn = db.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(booking)

        if not chauffeur_id or chauffeur_id == "auto":
            # Exact vehicle class match first
            cursor.execute("""
            SELECT * FROM chauffeurs 
            WHERE status = 'AVAILABLE' AND vehicle_class = ?
            ORDER BY rating DESC, trips_count DESC
            LIMIT 1
            """, (booking["vehicle_class"],))
            chauffeur = cursor.fetchone()

            # Otherwise any available among the 3 vehicles
            if not chauffeur:
                cursor.execute("""
                SELECT * FROM chauffeurs 
                WHERE status = 'AVAILABLE'
                ORDER BY rating DESC
                LIMIT 1
                """)
                chauffeur = cursor.fetchone()

            if not chauffeur:
                conn.close()
                self.send_json({"error": "All 3 vehicles are currently on active trips or on break."}, 409)
                return
            chauffeur_id = chauffeur["id"]
        else:
            cursor.execute("SELECT * FROM chauffeurs WHERE id = ?", (chauffeur_id,))
            chauffeur = cursor.fetchone()
            if not chauffeur:
                conn.close()
                self.send_json({"error": "Chauffeur not found"}, 404)
                return

        chauffeur = dict(chauffeur)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if booking["chauffeur_id"] and booking["chauffeur_id"] != chauffeur_id:
            cursor.execute("""
            UPDATE chauffeurs SET status = 'AVAILABLE', active_booking_id = NULL WHERE id = ?
            """, (booking["chauffeur_id"],))

        cursor.execute("""
        UPDATE chauffeurs SET status = 'ON_TRIP', active_booking_id = ? WHERE id = ?
        """, (booking_id, chauffeur_id))

        cursor.execute("""
        UPDATE bookings SET chauffeur_id = ?, status = 'ASSIGNED', updated_at = ? WHERE id = ?
        """, (chauffeur_id, now_str, booking_id))

        cnf_email_id = f"CNF-{random.randint(1000, 9999)}"
        email_subject = f"Chauffeur Assigned: {chauffeur['name']} - {booking['confirmation_code']}"
        html_email = build_luxury_email_html(
            booking_ref=booking['confirmation_code'],
            customer_name=booking['customer_name'],
            pickup_addr=booking['pickup_address'],
            dropoff_addr=booking['dropoff_address'],
            pickup_dt=booking['pickup_datetime'],
            vehicle_tier=booking['vehicle_class'],
            net_fare=booking.get('fare_amount', 165.0),
            vat_amt=booking.get('vat_amount'),
            total_fare=booking.get('total_fare'),
            service_type=booking.get('service_type', 'Airport Transfer'),
            passengers=booking.get('passenger_count', 1),
            large_cases=booking.get('large_cases', 0),
            medium_cases=booking.get('medium_cases', 0),
            hand_luggage=booking.get('hand_luggage', 0),
            chauffeur=chauffeur,
            flight=booking.get('flight_number')
        )
        plain_text_email = (
            f"Dear {booking['customer_name']},\n\n"
            f"Your executive chauffeur has been allocated for Booking {booking['confirmation_code']}.\n\n"
            f"Chauffeur: {chauffeur['name']} (Rating: {chauffeur['rating']}★)\n"
            f"Vehicle: {chauffeur['vehicle_model']}\n"
            f"Registration Plate: {chauffeur['license_plate']}\n"
            f"Direct Contact: {chauffeur['phone']}\n"
            f"Pickup: {booking['pickup_address']} at {booking['pickup_datetime']}\n\n"
            f"Your chauffeur will contact you prior to pickup.\n\n"
            f"GA Chauffeur Services Limited\n"
            f"{COMPANY_ADDRESS}\n"
            f"Website: {COMPANY_WEBSITE}\n"
            f"Direct Phone: {COMPANY_PHONE}"
        )

        send_smtp_email(booking["customer_email"], email_subject, html_email, plain_text_email)

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_email_id, booking_id, "EMAIL", booking["customer_email"],
            email_subject, plain_text_email, "DELIVERED", now_str
        ))

        cnf_sms_id = f"CNF-{random.randint(1000, 9999)}"
        sms_content = (
            f"GA Chauffeurs: {chauffeur['name']} is assigned to your trip {booking['confirmation_code']}. "
            f"Vehicle: {chauffeur['vehicle_model']} [{chauffeur['license_plate']}]. "
            f"Direct Line: {chauffeur['phone']}"
        )

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_sms_id, booking_id, "SMS", booking["customer_phone"],
            f"Chauffeur Assigned {booking['confirmation_code']}", sms_content, "DELIVERED", now_str
        ))

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            booking_id, chauffeur_id, "CHAUFFEUR_ALLOCATED", "Dispatch Control",
            f"Chauffeur {chauffeur['name']} ({chauffeur['vehicle_model']}) allocated to booking {booking['confirmation_code']}. Notifications dispatched to customer.",
            now_str
        ))

        conn.commit()
        conn.close()

        broadcast_event("chauffeur_allocated", {
            "booking_id": booking_id,
            "chauffeur_id": chauffeur_id,
            "chauffeur_name": chauffeur["name"],
            "status": "ASSIGNED"
        })

        self.send_json({
            "success": True,
            "booking_id": booking_id,
            "chauffeur": chauffeur,
            "status": "ASSIGNED"
        })

    def handle_live_action(self, booking_id, payload):
        action = payload.get("action", "").upper()
        allowed = ["ACCEPT", "EN_ROUTE_PICKUP", "ARRIVED", "ON_BOARD", "COMPLETED", "CANCEL"]
        if action not in allowed:
            self.send_json({"error": f"Invalid action: {action}. Allowed: {allowed}"}, 400)
            return

        conn = db.get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(booking)
        chauffeur_id = booking["chauffeur_id"]
        chauffeur = None
        if chauffeur_id:
            cursor.execute("SELECT * FROM chauffeurs WHERE id = ?", (chauffeur_id,))
            ch_row = cursor.fetchone()
            if ch_row:
                chauffeur = dict(ch_row)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_booking_status = booking["status"]
        sms_alert = None
        actor = payload.get("actor", "Chauffeur Mobile App")

        if action == "ACCEPT":
            new_booking_status = "ACCEPTED"
            details = f"Chauffeur {chauffeur['name'] if chauffeur else 'Assigned'} acknowledged and locked in the booking."

        elif action == "EN_ROUTE_PICKUP":
            new_booking_status = "EN_ROUTE"
            details = f"Chauffeur departed for pickup: {booking['pickup_address']}."
            sms_alert = f"GA Chauffeurs: {chauffeur['name'] if chauffeur else 'Your chauffeur'} is en route to {booking['pickup_address']}. Tracking: https://gachauffeurs.co.uk/track/{booking['confirmation_code']}"

        elif action == "ARRIVED":
            new_booking_status = "ARRIVED"
            if chauffeur_id:
                cursor.execute("UPDATE chauffeurs SET lat = ?, lng = ?, current_zone = ? WHERE id = ?",
                               (booking["pickup_lat"], booking["pickup_lng"], "At Pickup Location", chauffeur_id))
            details = f"Chauffeur arrived at {booking['pickup_address']}. Meet-and-greet nameboard active."
            sms_alert = f"GA Chauffeurs: Chauffeur {chauffeur['name'] if chauffeur else ''} has arrived at {booking['pickup_address']}. Vehicle: {chauffeur['vehicle_model'] if chauffeur else ''} [{chauffeur['license_plate'] if chauffeur else ''}]."

        elif action == "ON_BOARD":
            new_booking_status = "ON_BOARD"
            details = f"Passenger {booking['customer_name']} safely on board. Commenced journey to destination."
            sms_alert = f"GA Chauffeurs: Journey commenced to {booking['dropoff_address']}. Wi-Fi and amenities ready."

        elif action == "COMPLETED":
            new_booking_status = "COMPLETED"
            if chauffeur_id:
                cursor.execute("""
                UPDATE chauffeurs 
                SET lat = ?, lng = ?, status = 'AVAILABLE', active_booking_id = NULL,
                    trips_count = trips_count + 1, current_zone = 'Stanmore / London Base'
                WHERE id = ?
                """, (booking["dropoff_lat"], booking["dropoff_lng"], chauffeur_id))
            details = f"Journey successfully completed at {booking['dropoff_address']}. Official receipt issued."

            cnf_rec_id = f"CNF-{random.randint(1000, 9999)}"
            receipt_content = (
                f"GA Chauffeur Services Limited - Official Trip Receipt\n\n"
                f"Booking Reference: {booking['confirmation_code']}\n"
                f"Passenger: {booking['customer_name']}\n"
                f"Chauffeur: {chauffeur['name'] if chauffeur else 'GA Executive Chauffeur'}\n"
                f"Route: {booking['pickup_address']} -> {booking['dropoff_address']}\n"
                f"Distance: {booking['estimated_distance_mi']} miles\n"
                f"Total Charged: £{booking['fare_amount']:.2f} GBP (Paid via Corporate Account)\n\n"
                f"Thank you for traveling with GA Chauffeur Services Limited (gachauffeurs.co.uk)."
            )
            cursor.execute("""
            INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cnf_rec_id, booking_id, "EMAIL", booking["customer_email"],
                f"Official Receipt: {booking['confirmation_code']} - GA Chauffeur Services Limited", receipt_content, "DELIVERED", now_str
            ))

        elif action == "CANCEL":
            new_booking_status = "CANCELLED"
            if chauffeur_id:
                cursor.execute("UPDATE chauffeurs SET status = 'AVAILABLE', active_booking_id = NULL WHERE id = ?", (chauffeur_id,))
            details = f"Booking {booking['confirmation_code']} cancelled. Vehicle returned to dispatch pool."
            actor = "Dispatcher"

        cursor.execute("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?", (new_booking_status, now_str, booking_id))

        if sms_alert:
            sms_id = f"CNF-{random.randint(1000, 9999)}"
            cursor.execute("""
            INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sms_id, booking_id, "SMS", booking["customer_phone"],
                f"Live Status Update: {action}", sms_alert, "DELIVERED", now_str
            ))

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (booking_id, chauffeur_id, action, actor, details, now_str))

        conn.commit()
        conn.close()

        event_payload = {
            "booking_id": booking_id,
            "action": action,
            "new_status": new_booking_status,
            "chauffeur_id": chauffeur_id,
            "details": details,
            "timestamp": now_str
        }

        broadcast_event("live_action_executed", event_payload)
        self.send_json({"success": True, "action": action, "booking_status": new_booking_status, "details": details})

    def handle_get_chauffeurs(self, query):
        status_filter = query.get("status", ["ALL"])[0].upper()
        conn = db.get_connection()
        cursor = conn.cursor()

        sql = "SELECT * FROM chauffeurs"
        params = []
        if status_filter != "ALL":
            sql += " WHERE status = ?"
            params.append(status_filter)

        sql += " ORDER BY id ASC"
        cursor.execute(sql, params)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json({"chauffeurs": rows, "count": len(rows)})

    def handle_update_chauffeur_status(self, payload):
        chauffeur_id = payload.get("chauffeur_id")
        new_status = payload.get("status")
        if not chauffeur_id or not new_status:
            self.send_json({"error": "Missing chauffeur_id or status"}, 400)
            return

        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE chauffeurs SET status = ? WHERE id = ?", (new_status, chauffeur_id))
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (None, chauffeur_id, "STATUS_CHANGE", "Fleet Operations", f"Status updated to {new_status}", now_str))

        conn.commit()
        conn.close()

        broadcast_event("chauffeur_status_updated", {"chauffeur_id": chauffeur_id, "status": new_status})
        self.send_json({"success": True, "chauffeur_id": chauffeur_id, "status": new_status})

    def handle_get_confirmations(self):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.*, b.confirmation_code, b.customer_name
        FROM confirmations c
        LEFT JOIN bookings b ON c.booking_id = b.id
        ORDER BY c.sent_at DESC
        LIMIT 60
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json({"confirmations": rows, "count": len(rows)})

    def handle_resend_confirmation(self, payload):
        confirmation_id = payload.get("confirmation_id")
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM confirmations WHERE id = ?", (confirmation_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_json({"error": "Confirmation not found"}, 404)
            return

        conf = dict(row)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_id = f"CNF-{random.randint(1000, 9999)}"

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, conf["booking_id"], conf["channel"], conf["recipient"],
            conf["subject"] + " (Resent)", conf["content"], "DELIVERED", now_str
        ))

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (conf["booking_id"], None, "CONFIRMATION_RESENT", "Dispatcher", f"Resent {conf['channel']} to {conf['recipient']}", now_str))

        conn.commit()
        conn.close()

        broadcast_event("confirmation_resent", {"id": new_id, "booking_id": conf["booking_id"]})
        self.send_json({"success": True, "message": f"Confirmation resent via {conf['channel']} to {conf['recipient']}", "id": new_id})

    def handle_get_action_logs(self):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT a.*, b.confirmation_code, c.name as chauffeur_name
        FROM action_logs a
        LEFT JOIN bookings b ON a.booking_id = b.id
        LEFT JOIN chauffeurs c ON a.chauffeur_id = c.id
        ORDER BY a.id DESC
        LIMIT 60
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        self.send_json({"actions": rows, "count": len(rows)})

    def handle_get_stats(self):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_BOARD') THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed, SUM(fare_amount) as total_revenue FROM bookings")
        b_stats = dict(cursor.fetchone())

        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available, SUM(CASE WHEN status = 'ON_TRIP' THEN 1 ELSE 0 END) as on_trip FROM chauffeurs")
        c_stats = dict(cursor.fetchone())

        cursor.execute("SELECT COUNT(*) as total FROM confirmations")
        conf_count = cursor.fetchone()["total"]

        conn.close()
        self.send_json({
            "company": COMPANY_NAME,
            "website": COMPANY_WEBSITE,
            "phone": COMPANY_PHONE,
            "address": COMPANY_ADDRESS,
            "currency": "GBP",
            "fleet_size": 3,
            "bookings": b_stats,
            "chauffeurs": c_stats,
            "confirmations_dispatched": conf_count
        })

    def handle_simulation_tick(self):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.id as chauffeur_id, c.lat as ch_lat, c.lng as ch_lng,
               b.id as booking_id, b.status as booking_status,
               b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng
        FROM chauffeurs c
        JOIN bookings b ON c.active_booking_id = b.id
        WHERE c.status = 'ON_TRIP' AND b.status IN ('EN_ROUTE', 'ON_BOARD')
        """)
        active_trips = [dict(r) for r in cursor.fetchall()]
        moved = []

        for trip in active_trips:
            target_lat = trip["pickup_lat"] if trip["booking_status"] == "EN_ROUTE" else trip["dropoff_lat"]
            target_lng = trip["pickup_lng"] if trip["booking_status"] == "EN_ROUTE" else trip["dropoff_lng"]

            cur_lat = trip["ch_lat"]
            cur_lng = trip["ch_lng"]
            delta_lat = target_lat - cur_lat
            delta_lng = target_lng - cur_lng

            dist = math.sqrt(delta_lat**2 + delta_lng**2)
            if dist > 0.001:
                step_lat = cur_lat + delta_lat * 0.15
                step_lng = cur_lng + delta_lng * 0.15
                cursor.execute("UPDATE chauffeurs SET lat = ?, lng = ? WHERE id = ?", (step_lat, step_lng, trip["chauffeur_id"]))
                moved.append({"chauffeur_id": trip["chauffeur_id"], "lat": step_lat, "lng": step_lng})

        conn.commit()
        conn.close()

        if moved:
            broadcast_event("telemetry_update", {"moved": moved})

        self.send_json({"moved_count": len(moved), "moved": moved})


def run_server(port=PORT):
    os.makedirs(STATIC_DIR, exist_ok=True)
    db.init_db()
    db.seed_data()

    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, DispatchRequestHandler)
    print(f"============================================================")
    print(f"  {COMPANY_NAME.upper()}")
    print(f"  3-CAR EXCLUSIVE FLEET DISPATCH CONTROL (PORT {port})")
    print(f"  Office: {COMPANY_ADDRESS}")
    print(f"  Direct Line: {COMPANY_PHONE}")
    print(f"  URL: http://localhost:{port}")
    print(f"============================================================")

    def telemetry_ticker():
        while True:
            time.sleep(4)
            try:
                conn = db.get_connection()
                cursor = conn.cursor()
                cursor.execute("""
                SELECT c.id as chauffeur_id, c.lat as ch_lat, c.lng as ch_lng,
                       b.id as booking_id, b.status as booking_status,
                       b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng
                FROM chauffeurs c
                JOIN bookings b ON c.active_booking_id = b.id
                WHERE c.status = 'ON_TRIP' AND b.status IN ('EN_ROUTE', 'ON_BOARD')
                """)
                active_trips = [dict(r) for r in cursor.fetchall()]
                moved = []
                for trip in active_trips:
                    target_lat = trip["pickup_lat"] if trip["booking_status"] == "EN_ROUTE" else trip["dropoff_lat"]
                    target_lng = trip["pickup_lng"] if trip["booking_status"] == "EN_ROUTE" else trip["dropoff_lng"]
                    cur_lat = trip["ch_lat"]
                    cur_lng = trip["ch_lng"]
                    delta_lat = target_lat - cur_lat
                    delta_lng = target_lng - cur_lng
                    dist = math.sqrt(delta_lat**2 + delta_lng**2)
                    if dist > 0.001:
                        step_lat = cur_lat + delta_lat * 0.12
                        step_lng = cur_lng + delta_lng * 0.12
                        cursor.execute("UPDATE chauffeurs SET lat = ?, lng = ? WHERE id = ?", (step_lat, step_lng, trip["chauffeur_id"]))
                        moved.append({"chauffeur_id": trip["chauffeur_id"], "lat": step_lat, "lng": step_lng})
                conn.commit()
                conn.close()

                if moved:
                    broadcast_event("telemetry_update", {"moved": moved})
            except Exception:
                pass

    ticker_thread = threading.Thread(target=telemetry_ticker, daemon=True)
    ticker_thread.start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.shutdown()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else PORT))
    run_server(port)
