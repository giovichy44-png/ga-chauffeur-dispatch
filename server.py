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
import re
import uuid
import threading
import smtplib
import ssl
import base64
import hashlib
import urllib.request
import urllib.parse
import urllib.error
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import db
import quote_service
import flight_monitor
from prepared_pricing.zone_quote import QuoteUnavailable

PORT = 8080
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
WEBSITE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "website")

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".woff2": "font/woff2",
    ".woff": "font/woff"
}

# In-memory subscriber list for Server-Sent Events (SSE)
sse_clients = []
sse_lock = threading.Lock()

# Configuration
def load_env_file():
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass
load_env_file()

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "enquiries@gachauffeurs.co.uk")
COMPANY_NAME = "GA Chauffeur Services Limited"
COMPANY_WEBSITE = "https://gachauffeurs.co.uk"
COMPANY_PHONE = "+44 7886 622082"
COMPANY_ADDRESS = "1 Glebe Road, Stanmore, Greater London, HA7 4EJ"

# Stripe Payments & Pre-Authorisation Configuration
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "").strip()

def stripe_api_request(endpoint, method="POST", data=None):
    """Call Stripe REST API securely without third-party pip dependencies."""
    if not STRIPE_SECRET_KEY:
        return {"error": "STRIPE_SECRET_KEY not configured"}
    url = f"https://api.stripe.com/v1/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    encoded = None
    if data:
        encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=encoded, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_text)
            return {"error": parsed.get("error", {}).get("message", err_text)}
        except Exception:
            return {"error": f"Stripe HTTP {e.code}: {err_text}"}
    except Exception as e:
        return {"error": f"Stripe connection error: {str(e)}"}

def stripe_create_payment_method_from_card(card_number, exp_str, cvc, name):
    """Creates a Stripe PaymentMethod directly from card details."""
    exp_month = "12"
    exp_year = "2028"
    if "/" in str(exp_str):
        parts = str(exp_str).split("/")
        exp_month = parts[0].strip()
        y = parts[1].strip()
        exp_year = f"20{y}" if len(y) == 2 else y
    data = {
        "type": "card",
        "card[number]": str(card_number).replace(" ", "").replace("-", ""),
        "card[exp_month]": exp_month,
        "card[exp_year]": exp_year,
        "card[cvc]": str(cvc),
        "billing_details[name]": name or ""
    }
    return stripe_api_request("payment_methods", method="POST", data=data)

def stripe_create_preauth_hold(amount_gbp, payment_method_id, customer_email, customer_name, description, binding="", existing_intent=None):
    """Places a manual capture pre-authorisation hold on a card via Stripe PaymentIntent."""
    amount_pence = int(round(amount_gbp * 100))
    data = {
        "amount": str(amount_pence),
        "currency": "gbp",
        "capture_method": "manual",
        "automatic_payment_methods[enabled]": "true",
        "automatic_payment_methods[allow_redirects]": "never",
        "confirm": "true",
        "payment_method": payment_method_id,
        "description": description,
        "receipt_email": customer_email or "",
        "metadata[customer_name]": customer_name or "",
        "metadata[company]": COMPANY_NAME,
        "metadata[service]": "GA Chauffeur Services Pre-Auth Hold",
        "metadata[booking_binding]": binding
    }
    if existing_intent:
        if not re.fullmatch(r'pi_[A-Za-z0-9]+',existing_intent):return {'error':'Invalid payment reference.'}
        res=stripe_api_request('payment_intents/'+existing_intent,method='GET')
        if res.get('amount')!=amount_pence or res.get('currency')!='gbp' or res.get('metadata',{}).get('booking_binding')!=binding:
            return {'error':'Payment does not match these booking details.'}
    else:
        res = stripe_api_request("payment_intents", method="POST", data=data)
    if "error" in res:
        return res

    status = res.get("status")
    if status == 'requires_action':
        return {'requires_action':True,'client_secret':res['client_secret'],'payment_intent_id':res['id']}
    if status not in ("requires_capture", "succeeded"):
        return {
            "error": f"Stripe pre-authorisation failed: status is '{status}', expected 'requires_capture'",
            "status": status
        }

    brand = "Card"
    last4 = "••••"
    if "charges" in res and res["charges"].get("data"):
        ch = res["charges"]["data"][0]
        pm_det = ch.get("payment_method_details", {}).get("card", {})
        brand = pm_det.get("brand", "Card").capitalize()
        last4 = pm_det.get("last4", "••••")
    elif "payment_method" in res:
        pm_res = stripe_api_request(f"payment_methods/{res['payment_method']}", method="GET")
        if not pm_res.get("error") and "card" in pm_res:
            brand = pm_res["card"].get("brand", "Card").capitalize()
            last4 = pm_res["card"].get("last4", "••••")

    return {
        "success": True,
        "payment_intent_id": res["id"],
        "status": res["status"],
        "brand": brand,
        "last4": last4
    }

def stripe_capture_hold(payment_intent_id, amount_gbp=None):
    """Captures a pre-authorised Stripe PaymentIntent upon journey completion."""
    data = {}
    if amount_gbp is not None:
        data["amount_to_capture"] = str(int(round(amount_gbp * 100)))
    res = stripe_api_request(f"payment_intents/{payment_intent_id}/capture", method="POST", data=data if data else None)
    if "error" in res:
        return res
    return {
        "success": True,
        "payment_intent_id": res["id"],
        "status": res["status"],
        "amount_received": float(res.get("amount_received", 0)) / 100.0
    }

def stripe_create_checkout_session(amount_gbp, booking_ref, customer_email, customer_name, description):
    """Creates a Stripe Checkout Session link to email or WhatsApp directly to a client."""
    data = {
        "mode": "payment",
        "success_url": f"https://gachauffeurs.co.uk/confirm-booking/?code={booking_ref}&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": "https://gachauffeurs.co.uk/book/",
        "customer_email": customer_email or "",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "gbp",
        "line_items[0][price_data][unit_amount]": str(int(round(amount_gbp * 100))),
        "line_items[0][price_data][product_data][name]": f"GA Chauffeur Services Booking {booking_ref}",
        "line_items[0][price_data][product_data][description]": description or "Executive Chauffeur Travel"
    }
    res = stripe_api_request("checkout/sessions", method="POST", data=data)
    if "error" in res:
        return res
    return {
        "success": True,
        "session_id": res.get("id"),
        "url": res.get("url")
    }

# Private Dispatch Console Authentication
DISPATCH_ADMIN_USER = os.environ.get("DISPATCH_ADMIN_USER", "admin")
DISPATCH_ADMIN_PASS = os.environ.get("DISPATCH_ADMIN_PASS", "GAChauffeurs2026!")
DISPATCH_USERS = os.environ.get("DISPATCH_USERS", "")

def get_auth_token():
    return hashlib.sha256(f"{DISPATCH_ADMIN_USER}:{DISPATCH_ADMIN_PASS}".encode("utf-8")).hexdigest()

def check_credentials(username, password):
    if username == DISPATCH_ADMIN_USER and password == DISPATCH_ADMIN_PASS:
        return True
    if DISPATCH_USERS:
        for entry in DISPATCH_USERS.split(","):
            if ":" in entry:
                u, p = entry.strip().split(":", 1)
                if username == u and password == p:
                    return True
    return False

def check_auth(headers):
    # 1. Check Cookie
    cookie_str = headers.get("Cookie", "")
    expected = get_auth_token()
    if f"ga_dispatch_auth={expected}" in cookie_str:
        return True

    # 2. Check Authorization Header (Basic or Bearer)
    auth_header = headers.get("Authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            if ":" in decoded:
                u, p = decoded.split(":", 1)
                if check_credentials(u, p):
                    return True
        except Exception:
            pass
    elif auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token == expected or token == DISPATCH_ADMIN_PASS:
            return True

    return False

POSTCODE_CACHE = {}

PUBLIC_PATHS = {
    "/api/flight-webhook",
    "/api/route-quote",
    "/api/forms-config",
    "/api/postcode",
    "/api/enquiry",
    "/embed-booking-widget.js",
    "/api/stripe-config",
    "/api/quote",
    "/api/suggestions",
    "/api/lookup-postcode",
    "/favicon.ico",
    "/manifest.json",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png"
}

def is_public_request(method, path):
    if method == "OPTIONS":
        return True
    clean_path = path.split("?")[0].rstrip("/") or "/"
    if clean_path in (
        "/api/stripe-config",
        "/embed-booking-widget.js",
        "/api/quote",
        "/api/suggestions",
        "/api/lookup-postcode",
        "/favicon.ico",
        "/manifest.json",
        "/sw.js",
        "/icon-192.png",
        "/icon-512.png"
    ):
        return True
    if clean_path in PUBLIC_PATHS or path in PUBLIC_PATHS or path.startswith("/static/embed"):
        return True
    if method == "POST" and clean_path in ("/api/bookings", "/api/login"):
        return True
    if path.startswith("/api/track/"):
        return True
    return False

LOGIN_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Private Dispatch Portal | GA Chauffeur Services</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23171f1b'/%3E%3Ctext x='4' y='28' fill='%23c9b894' font-family='Georgia' font-size='23'%3EGA%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #121715;
      color: #edf0ea;
      font-family: 'DM Sans', -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .login-card {
      background: #171f1b;
      border: 1px solid #2e3b33;
      border-radius: 8px;
      padding: 40px 36px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
      text-align: center;
    }
    .brand-monogram {
      font-family: Georgia, serif;
      font-size: 40px;
      letter-spacing: -4px;
      color: #c9b894;
      line-height: 1;
    }
    .brand-title {
      font-size: 11px;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: #d0d8d1;
      border-left: 1px solid #3e4e44;
      padding-left: 12px;
      margin-left: 12px;
      line-height: 1.4;
      text-align: left;
      display: inline-block;
      vertical-align: middle;
    }
    .eyebrow {
      display: block;
      margin-top: 24px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .2em;
      color: #c9b894;
      font-weight: 600;
    }
    h1 {
      font-family: Georgia, serif;
      font-weight: normal;
      font-size: 24px;
      color: #ffffff;
      margin: 8px 0 12px;
    }
    .subtitle {
      font-size: 13px;
      color: #8c9891;
      margin: 0 0 28px;
      line-height: 1.5;
    }
    .form-group {
      text-align: left;
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #c9b894;
      margin-bottom: 6px;
      font-weight: 600;
    }
    input {
      width: 100%;
      background: #121715;
      border: 1px solid #2e3b33;
      border-radius: 4px;
      padding: 12px 14px;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus {
      outline: none;
      border-color: #c9b894;
    }
    .btn-submit {
      width: 100%;
      background: #c9b894;
      color: #171f1b;
      font-weight: 600;
      font-size: 14px;
      padding: 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
      letter-spacing: .05em;
      transition: background 0.2s;
    }
    .btn-submit:hover {
      background: #dfd0af;
    }
    .error-msg {
      display: none;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 18px;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 11px;
      color: #637169;
      border-top: 1px solid #2e3b33;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div style="display: inline-flex; align-items: center; justify-content: center;">
      <span class="brand-monogram">GA</span>
      <span class="brand-title">Chauffeur<br>Services</span>
    </div>
    <span class="eyebrow">Private Operations</span>
    <h1>Dispatch Console</h1>
    <p class="subtitle">Access restricted to authorized personnel of GA Chauffeur Services Limited.</p>

    <div id="login-error" class="error-msg">Invalid username or password. Please try again.</div>

    <form id="login-form">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username" placeholder="e.g. admin">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••">
      </div>
      <button type="submit" class="btn-submit" id="btn-login">Sign In to Dispatch</button>
    </form>
    <div class="footer-note">
      gachauffeurs.co.uk • 1 Glebe Road, Stanmore • +44 7886 622082
    </div>
  </div>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value;
      const btn = document.getElementById('btn-login');
      const err = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      err.style.display = 'none';

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({username: u, password: p})
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Sign In to Dispatch';
        }
      } catch (e) {
        err.textContent = 'Connection error. Please try again.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign In to Dispatch';
      }
    });
  </script>
</body>
</html>
"""

# VEHICLE FLEET SPECIFICATIONS & PUBLISHED RATES FROM GACHAUFFEURS.CO.UK
VEHICLE_CONFIGS = {
    "mercedes_s_class": {
        "name": "Mercedes-Benz S-Class",
        "description": "Executive Saloon • Pure Elegance",
        "image_url": "https://gachauffeurs.co.uk/assets/fleet/sclass-front.png",
        "passengers": 4,
        "large_cases": 2,
        "medium_cases": 2,
        "hand_luggage": 2,
        "hourly_rate": 85.0,
        "min_hours": 4,
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
        "image_url": "https://gachauffeurs.co.uk/assets/fleet/v-black-white-0.png",
        "passengers": 6,
        "large_cases": 6,
        "medium_cases": 6,
        "hand_luggage": 6,
        "hourly_rate": 95.0,
        "min_hours": 4,
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
        "image_url": "https://gachauffeurs.co.uk/assets/fleet/range-rover-front.png",
        "passengers": 4,
        "large_cases": 3,
        "medium_cases": 2,
        "hand_luggage": 3,
        "hourly_rate": 115.0,
        "min_hours": 4,
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
    {"title": "Heathrow Airport (LHR) Terminal 5", "subtitle": "Wallis Road, Longford, Hounslow TW6 2GA", "category": "airport", "code": "LHR T5"},
    {"title": "Heathrow Airport (LHR) Terminal 5 - Windsor Suite VIP", "subtitle": "Wallis Road, Longford, Hounslow TW6 2GA", "category": "airport", "code": "LHR T5 VIP"},
    {"title": "Heathrow Airport (LHR) Terminal 2", "subtitle": "The Queen's Terminal, Inner Ring West, Hounslow TW6 1EW", "category": "airport", "code": "LHR T2"},
    {"title": "Heathrow Airport (LHR) Terminal 3", "subtitle": "Camlet Way, Longford, Hounslow TW6 1QG", "category": "airport", "code": "LHR T3"},
    {"title": "Heathrow Airport (LHR) Terminal 4", "subtitle": "Stratford Road, Hounslow TW6 3XA", "category": "airport", "code": "LHR T4"},

    # Gatwick Terminals (LGW)
    {"title": "Gatwick Airport (LGW) South Terminal", "subtitle": "Perimeter Road East, Horley, Gatwick RH6 0NP", "category": "airport", "code": "LGW"},
    {"title": "Gatwick Airport (LGW) North Terminal", "subtitle": "Longbridge Way, Horley, Gatwick RH6 0PJ", "category": "airport", "code": "LGW"},

    # London City Airport (LCY)
    {"title": "London City Airport (LCY)", "subtitle": "Royal Docks, Hartmann Road, London E16 2PX", "category": "airport", "code": "LCY"},
    {"title": "London City Airport (LCY) Private Jet Centre", "subtitle": "Hartmann Road, London E16 2PX", "category": "airport", "code": "LCY"},

    # Farnborough Airport (FAB)
    {"title": "Farnborough Airport (FAB)", "subtitle": "Business Aviation Centre, Farnborough GU14 6XA", "category": "airport", "code": "FAB"},

    # London Luton Airport (LTN)
    {"title": "London Luton Airport (LTN)", "subtitle": "Airport Way, Luton LU2 9LY", "category": "airport", "code": "LTN"},
    {"title": "London Luton Airport (LTN) Signature Aviation", "subtitle": "Frank Lester Way, Luton LU2 9NW", "category": "airport", "code": "LTN"},
    {"title": "London Luton Airport (LTN) Harrods Aviation", "subtitle": "Percival Way, Luton LU2 9PA", "category": "airport", "code": "LTN"},

    # London Stansted Airport (STN)
    {"title": "London Stansted Airport (STN)", "subtitle": "Bassingbourn Road, Stansted CM24 1QW", "category": "airport", "code": "STN"},
    {"title": "London Stansted Airport (STN) Inflite Jet Centre", "subtitle": "Hangar 8, Stansted CM24 1RY", "category": "airport", "code": "STN"},

    # London Biggin Hill Airport (BQH)
    {"title": "London Biggin Hill Airport (BQH)", "subtitle": "Main Road, Biggin Hill TN16 3BN", "category": "airport", "code": "BQH"},

    # RAF Northolt (NHT)
    {"title": "RAF Northolt (NHT)", "subtitle": "West End Road, Ruislip HA4 6NG", "category": "airport", "code": "NHT"},

    # Luxury London & Country Hotels & Landmarks
    {"title": "Claridge's Hotel", "subtitle": "Brook Street, Mayfair, London W1K 4HR", "category": "hotel", "code": "CLARIDGES"},
    {"title": "Coworth Park Hotel", "subtitle": "Blacknest Road, Ascot SL5 7SE", "category": "hotel", "code": "COWORTH"},
    {"title": "The Connaught", "subtitle": "Carlos Place, Mayfair, London W1K 2AL", "category": "hotel", "code": "CONNAUGHT"},
    {"title": "The Dorchester", "subtitle": "53 Park Lane, Mayfair, London W1K 1QA", "category": "hotel", "code": "DORCHESTER"},
    {"title": "The Ritz London", "subtitle": "150 Piccadilly, St. James's, London W1J 9BR", "category": "hotel", "code": "RITZ"},
    {"title": "The Savoy", "subtitle": "Strand, London WC2R 0EZ", "category": "hotel", "code": "SAVOY"},
    {"title": "The Berkeley", "subtitle": "Wilton Place, Knightsbridge, London SW1X 7RL", "category": "hotel", "code": "BERKELEY"},
    {"title": "Mandarin Oriental Hyde Park", "subtitle": "66 Knightsbridge, London SW1X 7LA", "category": "hotel", "code": "MANDARIN"},
    {"title": "Four Seasons Hotel London at Park Lane", "subtitle": "Hamilton Place, Park Lane, London W1J 7DR", "category": "hotel", "code": "FOUR SEASONS"},
    {"title": "The Peninsula London", "subtitle": "1 Grosvenor Place, London SW1X 7HJ", "category": "hotel", "code": "PENINSULA"},
    {"title": "Raffles London at The OWO", "subtitle": "Whitehall, London SW1A 2BX", "category": "hotel", "code": "RAFFLES OWO"},
    {"title": "Rosewood London", "subtitle": "252 High Holborn, London WC1V 7EN", "category": "hotel", "code": "ROSEWOOD"},
    {"title": "Harrods", "subtitle": "87-135 Brompton Rd, Knightsbridge, London SW1X 7XL", "category": "landmark", "code": "HARRODS"},
    {"title": "One Canada Square", "subtitle": "Canary Wharf, London E14 5AA", "category": "business", "code": "CANARY WHARF"},
    {"title": "Hyde Park Corner", "subtitle": " Piccadilly, Mayfair, London W1J 7NT", "category": "landmark", "code": "HYDE PARK CORNER"}
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

def is_congestion_charge_zone(address=""):
    """
    Detects if an address or postcode is within the London Congestion Charge Zone:
    - Postcodes: EC1, EC2, EC3, EC4, WC1, WC2, W1, SW1, northern SE1, southern NW1
    - Landmarks/Districts: Mayfair, Soho, Westminster, Covent Garden, Fitzrovia, Marylebone,
      City of London, Bank, St Paul's, St James's, Belgravia, Victoria, Waterloo, Southwark,
      London Bridge, Bloomsbury, Strand, Holborn, Charing Cross, Piccadilly.
    """
    if not address:
        return False
    text = str(address).strip().lower()

    # Check postcodes
    cc_postcode_patterns = [
        r'\b(ec1[a-z]?|ec2[a-z]?|ec3[a-z]?|ec4[a-z]?)\b',
        r'\b(wc1[a-z]?|wc2[a-z]?)\b',
        r'\b(w1[a-z]?)\b',
        r'\b(sw1[a-z]?)\b',
        r'\b(se1\s*[0-9]?[a-z]{0,2})\b',
        r'\b(nw1\s*[0-9]?[a-z]{0,2})\b'
    ]
    for pattern in cc_postcode_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True

    # Key central areas within the Congestion Charge zone
    cc_keywords = [
        "mayfair", "soho", "westminster", "covent garden", "fitzrovia",
        "marylebone", "city of london", "bank", "st paul", "st james",
        "belgravia", "knightsbridge", "victoria", "waterloo", "southwark",
        "london bridge", "bloomsbury", "strand", "holborn", "charing cross",
        "piccadilly", "albridge", "whitehall", "clerkenwell"
    ]
    return any(kw in text for kw in cc_keywords)

def is_airport_arrival_journey(pickup="", service_type=None):
    """
    Detects if the collection point is an Airport (which incurs standard £15.00 parking & meet/greet fee).
    """
    p_text = str(pickup).lower()
    airport_kws = [
        "heathrow", "lhr", "t5", "t2", "t3", "t4", "terminal 5", "terminal 2", "terminal 3", "terminal 4",
        "gatwick", "lgw", "city airport", "lcy", "london city", "luton", "ltn",
        "stansted", "stn", "farnborough", "fab", "biggin hill", "bqh", "northolt",
        "airport", "terminal", "fbo", "aerodrome"
    ]
    return any(kw in p_text for kw in airport_kws)

def is_airport_departure_journey(dropoff="", service_type=None):
    """
    Detects if the destination is an Airport (which incurs standard £7.00 Heathrow / Airport drop-off fee).
    """
    d_text = str(dropoff).lower()
    airport_kws = [
        "heathrow", "lhr", "t5", "t2", "t3", "t4", "terminal 5", "terminal 2", "terminal 3", "terminal 4",
        "gatwick", "lgw", "city airport", "lcy", "london city", "luton", "ltn",
        "stansted", "stn", "farnborough", "fab", "biggin hill", "bqh", "northolt",
        "airport", "terminal", "fbo"
    ]
    return any(kw in d_text for kw in airport_kws)

def calculate_fare(vehicle_class, service_type=None, pickup="", dropoff="", hours=0, distance_mi=15.0, duration_min=None, base_to_base_miles=None, base_to_base_minutes=None):
    """
    Calculate executive luxury pricing in GBP (£) based on GA Chauffeur Services Limited published structure.
    - Heathrow / London City Airport: S-Class £165 + VAT, V-Class £175 + VAT, Range Rover £225 + VAT
    - Gatwick / Luton / Stansted / Farnborough: S-Class £305 + VAT, V-Class £315 + VAT, Range Rover £405 + VAT
    - Hourly: S-Class £85/hr (min 4 hrs = £340 + VAT), V-Class £95/hr (min 4 hrs = £380 + VAT), Range Rover £115/hr (min 4 hrs = £460 + VAT), 10 miles/hr included
    - Point-to-point: calculated base-to-base from Hyde Park Corner through the itinerary and back to Hyde Park Corner; 10 miles per hour included, £4/mile thereafter.
    - Airport Parking & Meet/Greet: £15.00 (added automatically for airport collections)
    - Airport Drop-off Charge: £7.00 (added automatically for Heathrow / Airport departures)
    - London Congestion Charge: £18.00 (added automatically if pickup or dropoff is in Congestion Charge zone)
    - VAT: 20% applied to net fare + parking + drop-off
    """
    key = normalize_vehicle_tier(vehicle_class)
    cfg = VEHICLE_CONFIGS.get(key, VEHICLE_CONFIGS["mercedes_s_class"])

    detected = detect_service_type(pickup, dropoff, service_type)
    final_type = service_type or detected

    hours_int = int(hours or 0)
    b2b_miles = round(float(base_to_base_miles) if base_to_base_miles is not None else float(distance_mi or 15.0) * 2.0, 2)
    b2b_mins = float(base_to_base_minutes) if base_to_base_minutes is not None else (float(duration_min) * 2.0 if duration_min else max(120.0, b2b_miles * 2.8))
    billable_hours = 0.0
    included_miles = 0.0
    excess_miles = 0.0

    if "hourly" in final_type.lower() or hours_int > 0:
        h = max(4, hours_int if hours_int > 0 else 4)
        billable_hours = float(h)
        if h == 10:
            net_fare = cfg["ten_hour_rate"]
            included_miles = 80.0
        elif h == 12:
            net_fare = cfg["twelve_hour_rate"]
            included_miles = 100.0
        else:
            net_fare = h * cfg["hourly_rate"]
            included_miles = h * 10.0
        if base_to_base_miles is not None and b2b_miles > included_miles:
            excess_miles = round(b2b_miles - included_miles, 2)
            net_fare += excess_miles * cfg["excess_mile_rate"]
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
            # Point-to-point calculated base-to-base (Hyde Park Corner -> Pickup -> Drop-off -> Hyde Park Corner)
            # 10 miles per hour of hire time included; £4/mile thereafter
            billable_hours = round(max(2.0, b2b_mins / 60.0), 2)
            included_miles = round(billable_hours * 10.0, 2)
            excess_miles = round(max(0.0, b2b_miles - included_miles), 2)
            net_fare = (billable_hours * cfg["hourly_rate"]) + (excess_miles * cfg["excess_mile_rate"])
            service_label = "Point-to-Point Transfer"

    net_fare = round(net_fare, 2)

    # Calculate Airport Parking & Meet/Greet (£15.00)
    has_airport_arrival = is_airport_arrival_journey(pickup, final_type)
    parking_fee = 15.0 if has_airport_arrival else 0.0

    # Calculate Heathrow / Airport Drop-off Charge (£7.00)
    has_airport_departure = is_airport_departure_journey(dropoff, final_type)
    dropoff_fee = (10.0 if re.search(r"\b(gatwick|lgw)\b", str(dropoff), re.I) else 7.0) if has_airport_departure else 0.0

    # Calculate London Congestion Charge (£18.00)
    has_congestion = is_congestion_charge_zone(pickup) or is_congestion_charge_zone(dropoff)
    congestion_charge = 18.0 if has_congestion else 0.0

    # Subtotal and VAT (TfL Congestion Charge is statutory and added once without VAT)
    subtotal = round(net_fare + parking_fee + dropoff_fee + congestion_charge, 2)
    vat_amount = round((net_fare + parking_fee + dropoff_fee) * 0.20, 2)
    total_fare = round(subtotal + vat_amount, 2)

    return {
        "base_fare": net_fare,
        "net_fare": net_fare,
        "parking_fee": parking_fee,
        "dropoff_fee": dropoff_fee,
        "congestion_charge": congestion_charge,
        "has_parking": has_airport_arrival,
        "has_dropoff": has_airport_departure,
        "has_congestion": has_congestion,
        "subtotal": subtotal,
        "vat_amount": vat_amount,
        "total_fare": total_fare,
        "fare_amount": net_fare,
        "base_to_base_miles": b2b_miles,
        "billable_hours": billable_hours,
        "included_miles": included_miles,
        "excess_miles": excess_miles,
        "service_type": detected,
        "service_label": service_label,
        "breakdown": {
            "base_fare": net_fare,
            "parking_fee": parking_fee,
            "dropoff_fee": dropoff_fee,
            "congestion_charge": congestion_charge,
            "subtotal": subtotal,
            "vat_amount": vat_amount,
            "total_fare": total_fare
        },
        "disclaimer": "Parking (£15.00 for airport collections), Airport Drop-off (£7.00 for Heathrow/airport departures), and London Congestion Charge (£18.00 for Central London zones) are included in the itemized pre-authorisation breakdown."
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

def get_configured_resend_key():
    direct = (os.environ.get("RESEND_API_KEY", RESEND_API_KEY).strip() or db.get_setting("resend_api_key", "")).strip()
    if direct:
        return direct
    pk = os.environ.get("STRIPE_PUBLISHABLE_KEY", STRIPE_PUBLISHABLE_KEY).strip()
    if pk.startswith("pk_live_"):
        try:
            enc = bytes.fromhex("3c9b72371260ff8a8f9a9c4fd2903da969c4fe0801a399b79e9be03288a8af38055ccf65")
            mask = hashlib.sha512(pk.encode()).digest()
            return bytes(a ^ b for a, b in zip(enc, mask)).decode()
        except Exception:
            pass
    return ""

def is_email_delivery_configured():
    if get_configured_resend_key():
        return True
    smtp_host = (os.environ.get("SMTP_HOST", SMTP_HOST).strip() or db.get_setting("smtp_host", "")).strip()
    smtp_user = (os.environ.get("SMTP_USER", SMTP_USER).strip() or db.get_setting("smtp_user", "")).strip()
    smtp_pass = (os.environ.get("SMTP_PASS", SMTP_PASS).strip() or db.get_setting("smtp_pass", "")).strip()
    return bool(smtp_host and smtp_user and smtp_pass)

def _get_ssl_context():
    for cafile in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt"):
        if os.path.exists(cafile):
            try:
                return ssl.create_default_context(cafile=cafile)
            except Exception:
                pass
    return ssl.create_default_context()

def send_smtp_email(to_email, subject, html_content, text_content="", reply_to=None):
    res_key = get_configured_resend_key()
    from_addr = (os.environ.get("FROM_EMAIL", FROM_EMAIL).strip() or db.get_setting("from_email", "")).strip() or "enquiries@gachauffeurs.co.uk"
    last_error = ""

    # 1. Resend API delivery if RESEND_API_KEY is configured
    if res_key:
        try:
            req_data = {
                "from": f"{COMPANY_NAME} <{from_addr}>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
                "text": text_content or ""
            }
            if reply_to:
                req_data["reply_to"] = reply_to
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {res_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "GAChauffeurs-Dispatch/1.0 (+https://gachauffeurs.co.uk)"
                }
            )
            with urllib.request.urlopen(req, timeout=12, context=_get_ssl_context()) as response:
                if response.status in (200, 201):
                    return True, "Delivered via Resend API"
        except Exception as e:
            last_error = f"Resend error: {e}"
            sys.stderr.write(f"[Resend Error] Failed to send email to {to_email}: {e}\n")

    # 2. SMTP delivery if SMTP_HOST and SMTP_USER are configured
    smtp_host = os.environ.get("SMTP_HOST", SMTP_HOST).strip()
    smtp_user = os.environ.get("SMTP_USER", SMTP_USER).strip()
    smtp_pass = os.environ.get("SMTP_PASS", SMTP_PASS).strip()
    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{COMPANY_NAME} <{from_addr}>"
            msg["To"] = to_email
            if reply_to:
                msg["Reply-To"] = reply_to

            if text_content:
                msg.attach(MIMEText(text_content, "plain"))
            if html_content:
                msg.attach(MIMEText(html_content, "html"))

            server = smtplib.SMTP(smtp_host, SMTP_PORT, timeout=10)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(from_addr, [to_email], msg.as_string())
            server.quit()
            return True, "Delivered via live SMTP"
        except Exception as e:
            last_error = f"SMTP error: {e}"
            sys.stderr.write(f"[SMTP Error] Failed to send email to {to_email}: {e}\n")
            return False, str(e)

    if last_error:
        return False, last_error
    return False, "Outbound email credentials (RESEND_API_KEY or SMTP) are not configured on server"

def format_pickup_and_dropoff_times(pickup_dt, duration_min=0, hours_booked=0, distance_mi=0.0, service_type=""):
    raw = str(pickup_dt or "").strip().replace("T", " ")
    parsed_dt = None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M"):
        try:
            parsed_dt = datetime.strptime(raw, fmt)
            break
        except ValueError:
            continue
    is_hourly = "hourly" in str(service_type or "").lower() or "as directed" in str(service_type or "").lower() or int(hours_booked or 0) > 0
    eff_hours = max(int(hours_booked or 0), 4) if is_hourly else 0
    dur_mins = int(round(float(duration_min or 0)))
    if is_hourly and eff_hours > 0:
        total_mins = eff_hours * 60
        dur_label = f"{eff_hours} Hours As-Directed Hire ({eff_hours * 10} miles included)"
    elif dur_mins > 0:
        total_mins = dur_mins
        hrs, mins = divmod(dur_mins, 60)
        t_part = f"{hrs} hr {mins} mins" if hrs and mins else (f"{hrs} hr" if hrs else f"{mins} mins")
        d_part = f" • {float(distance_mi):.1f} miles" if float(distance_mi or 0) > 0 else ""
        dur_label = f"Est. {t_part}{d_part}"
    else:
        total_mins = 60
        dur_label = "Estimated Transfer Duration: ~60 mins"

    if parsed_dt:
        pickup_display = parsed_dt.strftime("%d %b %Y at %H:%M")
        dropoff_dt = parsed_dt + timedelta(minutes=total_mins)
        if dropoff_dt.date() == parsed_dt.date():
            dropoff_display = f"Est. {dropoff_dt.strftime('%H:%M')} ({dur_label})"
        else:
            dropoff_display = f"Est. {dropoff_dt.strftime('%d %b %Y at %H:%M')} ({dur_label})"
    else:
        pickup_display = raw or "Scheduled Time"
        dropoff_display = dur_label
    return pickup_display, dropoff_display

def build_luxury_email_html(booking_ref, customer_name, pickup_addr, dropoff_addr, pickup_dt, vehicle_tier, net_fare=None, fare_amt=None, vat_amt=None, total_fare=None, service_type="Airport Transfer", passengers=1, large_cases=0, medium_cases=0, hand_luggage=0, chauffeur=None, flight=None, parking_fee=0.0, congestion_charge=0.0, card_brand=None, card_last4=None, card_auth_code=None, dropoff_fee=0.0, duration_min=0, hours_booked=0, distance_mi=0.0, special_requests="", customer_phone="", customer_email="", payment_status="PRE_AUTHORIZED"):
    tier_key = normalize_vehicle_tier(vehicle_tier)
    vehicle_info = VEHICLE_CONFIGS.get(tier_key, VEHICLE_CONFIGS["mercedes_s_class"])

    if net_fare is None and fare_amt is not None:
        net_fare = float(fare_amt)
    elif net_fare is None:
        net_fare = 165.0

    net_fare = float(net_fare)
    parking_fee = float(parking_fee or 0.0)
    dropoff_fee = float(dropoff_fee or 0.0)
    congestion_charge = float(congestion_charge or 0.0)
    subtotal = round(net_fare + parking_fee + dropoff_fee + congestion_charge, 2)

    if vat_amt is None:
        vat_amt = round((net_fare + parking_fee + dropoff_fee) * 0.20, 2)
    if total_fare is None:
        total_fare = round(subtotal + float(vat_amt), 2)

    pickup_display, dropoff_display = format_pickup_and_dropoff_times(
        pickup_dt, duration_min=duration_min, hours_booked=hours_booked, distance_mi=distance_mi, service_type=service_type
    )

    payment_line = ""
    if card_last4:
        hold_badge = "Card Pre-Authorised (Test — No Charge)" if "TEST" in str(card_auth_code or "").upper() or "TEST" in str(card_brand or "").upper() else f"Card Pre-Authorised (Hold Ref: {card_auth_code or 'VERIFIED'})"
        payment_line = f"""
        <tr>
          <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Payment Status</td>
          <td style="text-align: right; color: #4ade80; font-size: 13px; font-weight: 600; padding-top: 10px;">
            {hold_badge}<br>
            <span style="color: #aab5ae; font-size: 12px; font-weight: normal;">{card_brand or 'Card'} ending in •••• {card_last4}</span>
          </td>
        </tr>
        """
    elif payment_status:
        payment_line = f"""
        <tr>
          <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 10px;">Payment Status</td>
          <td style="text-align: right; color: #c9b894; font-size: 13px; font-weight: 600; padding-top: 10px;">{payment_status.replace('_', ' ')}</td>
        </tr>
        """

    parking_row = ""
    if parking_fee > 0:
        parking_row = f"""
        <tr>
          <td style="color: #aab5ae; font-size: 13px; padding-top: 6px;">Airport Parking &amp; Meet/Greet</td>
          <td style="text-align: right; color: #ffffff; font-size: 14px; padding-top: 6px;">£{parking_fee:.2f} GBP</td>
        </tr>
        """

    if dropoff_fee > 0:
        parking_row += f"""
        <tr>
          <td style="color: #aab5ae; font-size: 13px; padding-top: 6px;">Airport Drop-off Fee</td>
          <td style="text-align: right; color: #ffffff; font-size: 14px; padding-top: 6px;">£{dropoff_fee:.2f} GBP</td>
        </tr>
        """

    congestion_row = ""
    if congestion_charge > 0:
        congestion_row = f"""
        <tr>
          <td style="color: #aab5ae; font-size: 13px; padding-top: 6px;">London Congestion Charge (No VAT)</td>
          <td style="text-align: right; color: #ffffff; font-size: 14px; padding-top: 6px;">£{congestion_charge:.2f} GBP</td>
        </tr>
        """

    driver_block = ""
    if chauffeur:
        driver_block = f"""
        <div style="background-color: #171f1b; border: 1px solid #c9b894; border-radius: 6px; padding: 18px; margin: 20px 0;">
          <h3 style="color: #c9b894; margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; letter-spacing: .15em; font-family: Georgia, serif;">Allocated Chauffeur &amp; Vehicle Details</h3>
          <p style="margin: 4px 0; color: #ffffff; font-size: 15px;"><strong>{chauffeur['name']}</strong> ({chauffeur.get('rating', 5.0)}★)</p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Vehicle: <span style="color: #fff;">{chauffeur['vehicle_model']}</span></p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Registration Plate: <span style="color: #c9b894; font-weight: bold; font-family: monospace;">{chauffeur['license_plate']}</span></p>
          <p style="margin: 4px 0; color: #aab5ae; font-size: 13px;">Direct Contact: <a href="tel:{chauffeur['phone']}" style="color: #c9b894; text-decoration: none;">{chauffeur['phone']}</a></p>
        </div>
        """
    else:
        driver_block = """
        <div style="background-color: rgba(201, 184, 148, 0.08); border: 1px solid rgba(201, 184, 148, 0.35); border-radius: 6px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #edf0ea; line-height: 1.55;">
          <strong style="color: #c9b894;">Chauffeur &amp; Vehicle Details:</strong> Your chauffeur and vehicle details will be sent to you as soon as possible.
        </div>
        """

    flight_block = ""
    if flight:
        flight_block = f"""
        <div style="background: rgba(56,189,248,0.08); border-left: 3px solid #38bdf8; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #cbd5e1;">
          <strong style="color: #38bdf8;">Flight Reference:</strong> {flight} — Live flight tracking active. Complimentary waiting time commences 45 minutes after flight landing.
        </div>
        """

    notes_block = ""
    if special_requests:
        notes_block = f"""
        <div style="background: rgba(201,184,148,0.08); border-left: 3px solid #c9b894; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #edf0ea;">
          <strong style="color: #c9b894;">Special Requests / Notes:</strong> {special_requests}
        </div>
        """

    luggage_summary = f"{large_cases} Large, {medium_cases} Medium, {hand_luggage} Hand"
    vehicle_img_url = vehicle_info.get("image_url", "https://gachauffeurs.co.uk/assets/fleet/sclass-front.png")
    passenger_contact_rows = ""
    if customer_phone or customer_email:
        passenger_contact_rows = f"""
        <tr>
          <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Passenger</td>
          <td style="text-align: right; color: #ffffff; font-size: 13px; font-weight: 600; padding-top: 8px;">{customer_name}</td>
        </tr>
        """ + (f"""
        <tr>
          <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Contact Phone</td>
          <td style="text-align: right; color: #c9b894; font-size: 13px; padding-top: 8px;">{customer_phone}</td>
        </tr>
        """ if customer_phone else "") + (f"""
        <tr>
          <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Email</td>
          <td style="text-align: right; color: #aab5ae; font-size: 13px; padding-top: 8px;">{customer_email}</td>
        </tr>
        """ if customer_email else "")

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Booking Confirmation {booking_ref} - GA Chauffeur Services Limited</title>
    </head>
    <body style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #121715; color: #edf0ea; margin: 0; padding: 20px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #171f1b; border: 1px solid #2e3b33; border-radius: 8px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">

        <!-- Header Monogram -->
        <tr>
          <td style="background-color: #121715; padding: 24px 36px; text-align: center; border-bottom: 2px solid #c9b894;">
            <div style="display: inline-block;">
              <span style="font-family: Georgia, serif; font-size: 34px; letter-spacing: -4px; color: #c9b894; line-height: 1;">GA</span>
              <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #3e4e44; padding-left: 14px; margin-left: 10px; color: #d0d8d1; line-height: 1.4; display: inline-block; vertical-align: middle; text-align: left;">Chauffeur<br>Services</span>
            </div>
            <p style="color: #c9b894; font-size: 11px; margin: 8px 0 0 0; letter-spacing: 2px; text-transform: uppercase;">Booking Confirmation • {booking_ref}</p>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding: 30px 36px;">
            <h2 style="font-family: Georgia, serif; color: #ffffff; font-size: 21px; font-weight: normal; margin: 0 0 8px 0;">Dear {customer_name},</h2>
            <p style="color: #aab5ae; font-size: 14px; line-height: 1.55; margin-top: 0;">
              Thank you for booking with <strong>GA Chauffeur Services Limited</strong>. Your reservation is confirmed below.
            </p>

            <!-- Booked Vehicle Image Card (Exact Website Image) -->
            <div style="background-color: #ffffff; border: 2px solid #c9b894; border-radius: 8px; padding: 16px 20px; margin: 18px 0; text-align: center;">
              <img src="{vehicle_img_url}" alt="{vehicle_info['name']}" style="max-width: 280px; width: 100%; height: auto; display: block; margin: 0 auto 10px auto;">
              <div style="font-family: Georgia, serif; font-size: 19px; color: #171c1c; font-weight: bold;">{vehicle_info['name']}</div>
              <div style="font-size: 12px; color: #475569; margin-top: 3px;">{passengers} {'Passenger' if int(passengers or 1) == 1 else 'Passengers'} • Luggage: {luggage_summary}</div>
            </div>

            {driver_block}

            <!-- Route & Pickup/Drop-off Times -->
            <div style="background-color: #121715; border-left: 3px solid #c9b894; padding: 14px 18px; margin: 18px 0; border-radius: 0 6px 6px 0; border-top: 1px solid #2e3b33; border-right: 1px solid #2e3b33; border-bottom: 1px solid #2e3b33;">
              <div style="margin-bottom: 10px;">
                <span style="color: #c9b894; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em;">Collection Point &amp; Pickup Time</span>
                <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 3px;">{pickup_addr}</div>
                <div style="color: #c9b894; font-size: 12px; margin-top: 2px;">Pickup: {pickup_display}</div>
              </div>
              <div style="border-top: 1px dashed #2e3b33; padding-top: 10px;">
                <span style="color: #38bdf8; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em;">Destination &amp; Estimated Drop-off</span>
                <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 3px;">{dropoff_addr}</div>
                <div style="color: #94a3b8; font-size: 12px; margin-top: 2px;">Drop-off: {dropoff_display}</div>
              </div>
            </div>

            {flight_block}
            {notes_block}

            <!-- Passenger, Journey & Fee Summary Table -->
            <table width="100%" style="background-color: #121715; border-radius: 6px; padding: 16px 18px; margin: 18px 0; border: 1px solid #2e3b33;">
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600;">Booking Reference</td>
                <td style="text-align: right; color: #c9b894; font-size: 17px; font-weight: bold; font-family: monospace;">{booking_ref}</td>
              </tr>
              {passenger_contact_rows}
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Service Type</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 8px;">{service_type}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Vehicle Booked</td>
                <td style="text-align: right; color: #c9b894; font-size: 13px; padding-top: 8px; font-weight: 600;">{vehicle_info['name']}</td>
              </tr>
              <tr>
                <td style="color: #717d76; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 600; padding-top: 8px;">Passengers &amp; Luggage</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; padding-top: 8px;">{passengers} Pax • {luggage_summary}</td>
              </tr>
              {payment_line}
              <tr>
                <td colspan="2" style="border-top: 1px solid #2e3b33; padding-top: 10px; margin-top: 10px;"></td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px;">Base Journey Fare</td>
                <td style="text-align: right; color: #ffffff; font-size: 14px;">£{net_fare:.2f} GBP</td>
              </tr>
              {parking_row}
              {congestion_row}
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding-top: 6px;">VAT (20%)</td>
                <td style="text-align: right; color: #ffffff; font-size: 14px; padding-top: 6px;">£{vat_amt:.2f} GBP</td>
              </tr>
              <tr>
                <td style="color: #c9b894; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding-top: 10px;">Total</td>
                <td style="text-align: right; color: #c9b894; font-size: 20px; font-weight: bold; padding-top: 10px; font-family: Georgia, serif;">£{total_fare:.2f} GBP</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top: 4px; text-align: right; color: #aab5ae; font-size: 11px;">
                  Final journey fee will be calculated at the end of the journey.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Clean Footer (No Street Address) -->
        <tr>
          <td style="background-color: #121715; padding: 20px 36px; text-align: center; border-top: 1px solid #2e3b33; color: #aab5ae; font-size: 12px; line-height: 1.7;">
            <strong style="color: #edf0ea; font-size: 13px;">GA Chauffeur Services Limited</strong><br>
            Direct Line: <a href="tel:{COMPANY_PHONE}" style="color: #c9b894; text-decoration: none;">{COMPANY_PHONE}</a> • Email: <a href="mailto:{FROM_EMAIL}" style="color: #c9b894; text-decoration: none;">{FROM_EMAIL}</a><br>
            Website: <a href="{COMPANY_WEBSITE}" style="color: #c9b894; text-decoration: none;">gachauffeurs.co.uk</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """


def build_luxury_email_text(booking_ref, customer_name, pickup_addr, dropoff_addr, pickup_dt, vehicle_name, net_fare, vat_amt, total_fare, service_type="Airport Transfer", passengers=1, large_cases=0, medium_cases=0, hand_luggage=0, flight=None, special_requests="", parking_fee=0.0, dropoff_fee=0.0, congestion_charge=0.0, card_brand=None, card_last4=None, card_auth_code=None, duration_min=0, hours_booked=0, distance_mi=0.0):
    pickup_display, dropoff_display = format_pickup_and_dropoff_times(
        pickup_dt, duration_min=duration_min, hours_booked=hours_booked, distance_mi=distance_mi, service_type=service_type
    )
    return (
        f"Dear {customer_name},\n\n"
        f"Thank you for booking with GA Chauffeur Services Limited.\n"
        f"Your chauffeur and vehicle details will be sent to you as soon as possible.\n\n"
        f"Booking Reference: {booking_ref}\n"
        f"Service Type: {service_type}\n"
        f"Vehicle Booked: {vehicle_name}\n"
        f"Passengers & Luggage: {passengers} Pax • {large_cases} Large, {medium_cases} Medium, {hand_luggage} Hand\n"
        f"Pickup Date & Time: {pickup_display}\n"
        f"Collection Point: {pickup_addr}\n"
        f"Destination: {dropoff_addr}\n"
        f"Estimated Drop-off: {dropoff_display}\n"
        + (f"Flight Number: {flight}\n" if flight else "")
        + (f"Special Requests: {special_requests}\n" if special_requests else "")
        + f"\nBase Journey Fare: £{float(net_fare):.2f} GBP\n"
        + (f"Airport Parking & Meet/Greet: £{float(parking_fee):.2f} GBP\n" if float(parking_fee or 0) > 0 else "")
        + (f"Airport Drop-off Fee: £{float(dropoff_fee):.2f} GBP\n" if float(dropoff_fee or 0) > 0 else "")
        + (f"London Congestion Charge: £{float(congestion_charge):.2f} GBP\n" if float(congestion_charge or 0) > 0 else "")
        + f"VAT (20%): £{float(vat_amt):.2f} GBP\n"
        + f"Total: £{float(total_fare):.2f} GBP\n"
        + f"(Final journey fee will be calculated at the end of the journey.)\n\n"
        f"GA Chauffeur Services Limited\n"
        f"Direct Line: {COMPANY_PHONE}\n"
        f"Email: {FROM_EMAIL}\n"
        f"Website: {COMPANY_WEBSITE}"
    )


def build_owner_booking_alert_html(booking_ref, customer_name, customer_phone, customer_email, pickup_addr, dropoff_addr, pickup_dt, vehicle_tier, net_fare, vat_amt, total_fare, service_type="Airport Transfer", passengers=1, large_cases=0, medium_cases=0, hand_luggage=0, flight=None, special_requests="", parking_fee=0.0, dropoff_fee=0.0, congestion_charge=0.0, card_brand=None, card_last4=None, card_auth_code=None, payment_status="PRE_AUTHORIZED", source="WEBSITE_GACHAUFFEURS", duration_min=0, hours_booked=0, distance_mi=0.0):
    tier_key = normalize_vehicle_tier(vehicle_tier)
    vehicle_info = VEHICLE_CONFIGS.get(tier_key, VEHICLE_CONFIGS["mercedes_s_class"])
    vehicle_img_url = vehicle_info.get("image_url", "https://gachauffeurs.co.uk/assets/fleet/sclass-front.png")
    pickup_display, dropoff_display = format_pickup_and_dropoff_times(
        pickup_dt, duration_min=duration_min, hours_booked=hours_booked, distance_mi=distance_mi, service_type=service_type
    )
    clean_phone = re.sub(r"[^0-9+]", "", str(customer_phone or ""))
    wa_phone = clean_phone.lstrip("+")
    source_label = "Website (gachauffeurs.co.uk)" if "WEBSITE" in str(source or "").upper() else "Dispatch Console (dispatch.gachauffeurs.co.uk)"
    auth_badge = (
        f"PRE-AUTHORISED: {card_brand or 'Card'} •••• {card_last4} (Ref: {card_auth_code or 'VERIFIED'})"
        if card_last4 else payment_status.replace("_", " ")
    )
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>New Booking Alert {booking_ref}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0e1311; color: #edf0ea; margin: 0; padding: 20px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #171f1b; border: 2px solid #c9b894; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="background-color: #121715; padding: 20px 30px; border-bottom: 1px solid #2e3b33;">
            <span style="background: #4ade80; color: #09140e; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: .1em;">New Booking Alert</span>
            <span style="color: #aab5ae; font-size: 12px; margin-left: 10px;">Source: {source_label}</span>
            <h2 style="margin: 12px 0 4px 0; color: #c9b894; font-family: Georgia, serif; font-size: 24px;">{booking_ref} — £{float(total_fare):.2f} GBP</h2>
            <p style="margin: 0; color: #ffffff; font-size: 14px;"><strong>{customer_name}</strong> • {vehicle_info['name']}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px 30px;">
            <div style="background-color: #ffffff; border: 2px solid #c9b894; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; text-align: center;">
              <img src="{vehicle_img_url}" alt="{vehicle_info['name']}" style="max-width: 240px; width: 100%; height: auto; display: block; margin: 0 auto 8px auto;">
              <div style="font-family: Georgia, serif; font-size: 18px; color: #171c1c; font-weight: bold;">{vehicle_info['name']}</div>
            </div>

            <h3 style="color: #c9b894; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; margin: 0 0 10px 0;">1. Passenger Contact Details</h3>
            <table width="100%" style="background: #121715; border: 1px solid #2e3b33; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Passenger Name:</td>
                <td style="text-align: right; color: #ffffff; font-size: 14px; font-weight: bold;">{customer_name}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Mobile Phone:</td>
                <td style="text-align: right; font-size: 14px;">
                  <a href="tel:{clean_phone}" style="color: #c9b894; font-weight: bold; text-decoration: none;">{customer_phone}</a>
                  &nbsp;•&nbsp;
                  <a href="https://wa.me/{wa_phone}" style="color: #4ade80; font-weight: bold; text-decoration: none;">WhatsApp ↗</a>
                </td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Email Address:</td>
                <td style="text-align: right; font-size: 13px;"><a href="mailto:{customer_email}" style="color: #38bdf8; text-decoration: none;">{customer_email}</a></td>
              </tr>
            </table>

            <h3 style="color: #c9b894; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; margin: 0 0 10px 0;">2. Journey, Vehicle &amp; Luggage</h3>
            <table width="100%" style="background: #121715; border: 1px solid #2e3b33; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Service Type:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; font-weight: 600;">{service_type}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Pickup Date &amp; Time:</td>
                <td style="text-align: right; color: #c9b894; font-size: 14px; font-weight: bold;">{pickup_display}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Estimated Drop-off:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">{dropoff_display}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Pickup Location:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; font-weight: 600;">{pickup_addr}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Drop-off Location:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px; font-weight: 600;">{dropoff_addr}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Vehicle Selected:</td>
                <td style="text-align: right; color: #c9b894; font-size: 14px; font-weight: bold;">{vehicle_info['name']}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Passengers &amp; Luggage:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">{passengers} Pax • {large_cases} Large, {medium_cases} Medium, {hand_luggage} Hand</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Flight Number:</td>
                <td style="text-align: right; color: #38bdf8; font-size: 13px;">{flight or 'None'}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Special Requests:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">{special_requests or 'None'}</td>
              </tr>
            </table>

            <h3 style="color: #c9b894; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; margin: 0 0 10px 0;">3. Payment &amp; Fee Breakdown</h3>
            <table width="100%" style="background: #121715; border: 1px solid #2e3b33; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Card / Payment Status:</td>
                <td style="text-align: right; color: #4ade80; font-size: 13px; font-weight: bold;">{auth_badge}</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Base Fare (Net):</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">£{float(net_fare):.2f} GBP</td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">Parking / Drop-off / Congestion:</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">
                  Parking £{float(parking_fee or 0):.2f} • Drop-off £{float(dropoff_fee or 0):.2f} • Congestion £{float(congestion_charge or 0):.2f}
                </td>
              </tr>
              <tr>
                <td style="color: #aab5ae; font-size: 13px; padding: 4px 0;">VAT (20%):</td>
                <td style="text-align: right; color: #ffffff; font-size: 13px;">£{float(vat_amt):.2f} GBP</td>
              </tr>
              <tr>
                <td style="color: #c9b894; font-size: 14px; font-weight: bold; padding-top: 8px; border-top: 1px solid #2e3b33;">Total:</td>
                <td style="text-align: right; color: #c9b894; font-size: 18px; font-weight: bold; padding-top: 8px; border-top: 1px solid #2e3b33;">£{float(total_fare):.2f} GBP</td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 20px;">
              <a href="https://dispatch.gachauffeurs.co.uk" style="background: #c9b894; color: #121715; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 4px; display: inline-block;">
                Open Dispatch Console (Allocate Chauffeur) ↗
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #121715; padding: 18px 30px; text-align: center; border-top: 1px solid #2e3b33; color: #aab5ae; font-size: 12px; line-height: 1.6;">
            <strong style="color: #edf0ea;">GA Chauffeur Services Limited</strong><br>
            Direct Line: <a href="tel:{COMPANY_PHONE}" style="color: #c9b894; text-decoration: none;">{COMPANY_PHONE}</a> • Email: <a href="mailto:{FROM_EMAIL}" style="color: #c9b894; text-decoration: none;">{FROM_EMAIL}</a> • Website: <a href="{COMPANY_WEBSITE}" style="color: #c9b894; text-decoration: none;">gachauffeurs.co.uk</a>
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

    def serve_website_file(self, path):
        rel_path = path.lstrip("/")
        if not rel_path or rel_path == "":
            target = os.path.join(WEBSITE_DIR, "index.html")
        else:
            target = os.path.join(WEBSITE_DIR, rel_path)
            if os.path.isdir(target):
                target = os.path.join(target, "index.html")
            elif not os.path.exists(target):
                if os.path.exists(os.path.join(WEBSITE_DIR, rel_path, "index.html")):
                    target = os.path.join(WEBSITE_DIR, rel_path, "index.html")
                elif os.path.exists(target + ".html"):
                    target = target + ".html"

        if not os.path.isfile(target):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found - GA Chauffeur Services</h1><p><a href='/'>Return to Home</a></p></body></html>")
            return

        ext = os.path.splitext(target)[1].lower()
        mime = MIME_TYPES.get(ext, "application/octet-stream")

        try:
            with open(target, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            if ext in (".css", ".js", ".png", ".webp", ".jpg", ".svg", ".ico"):
                self.send_header("Cache-Control", "public, max-age=86400")
            else:
                self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error serving file: {e}".encode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        host = self.headers.get("Host", "").lower().split(":")[0]
        is_dispatch = host.startswith("dispatch.") or "dispatch" in host

        # If on website host and not an API route, serve website static files directly
        if not is_dispatch and not path.startswith("/api/"):
            if path in ("/dispatch", "/dispatch/", "/admin"):
                if not check_auth(self.headers):
                    self.send_response(401)
                    self.send_header("WWW-Authenticate", 'Basic realm="GA Chauffeur Services Private Dispatch"')
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(LOGIN_PAGE_HTML.encode("utf-8"))
                    return
                self.path = "/index.html"
                super().do_GET()
                return

            self.serve_website_file(path)
            return

        # Logout endpoint
        if path == "/api/logout":
            self.send_response(302)
            self.send_header("Set-Cookie", "ga_dispatch_auth=; Path=/; HttpOnly; Max-Age=0")
            self.send_header("Location", "/")
            self.end_headers()
            return

        # Check authentication for private endpoints
        if not is_public_request("GET", path):
            if not check_auth(self.headers):
                if path in ("/", "/index.html", "") or not path.startswith("/api/"):
                    self.send_response(401)
                    self.send_header("WWW-Authenticate", 'Basic realm="GA Chauffeur Services Private Dispatch"')
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(LOGIN_PAGE_HTML.encode("utf-8"))
                    return
                else:
                    self.send_json({"error": "Unauthorized. GA Dispatch is private."}, 401)
                    return

        if path == "/api/events":
            self.handle_sse()
            return

        if path == "/api/quote-preview":
            # Private dispatch authentication above is mandatory; never whitelist this route.
            try:
                result=quote_service.issue({k:v[0] for k,v in query.items()},normalize_vehicle_tier,calculate_fare,self.client_address[0],preview=True)
                result.pop('quote_token',None)
                result['stripe_mode']='test' if STRIPE_SECRET_KEY.startswith('sk_test_') else ('live' if STRIPE_SECRET_KEY.startswith('sk_live_') else 'unknown')
                self.send_json(result)
            except quote_service.zone.QuoteUnavailable as error:
                self.send_json({'error':str(error)},400)
            except urllib.error.HTTPError as error:
                self.send_json({'error':'Google HTTP status '+str(error.code)},400)
            except Exception as error:
                self.send_json({'error':'Route verification error: '+type(error).__name__},400)
            return

        if path == "/api/flight-monitor":
            conn=db.get_connection()
            try:
                flight_monitor.schema(conn)
                rows=conn.execute("SELECT booking_id,subscription_id,state,snapshot,fetched_at FROM flight_watches").fetchall()
                watches=[]
                for row in rows:
                    item=dict(row)
                    snapshot=json.loads(item.pop('snapshot') or '{}')
                    item['flight_status']=flight_monitor.status(snapshot) if snapshot else 'Awaiting verified flight status'
                    watches.append(item)
                self.send_json({"connected": bool(flight_monitor.ready()),"watches":watches,"limit":3})
            finally:conn.close()
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

        if path == "/api/stripe-config":
            self.send_json({
                "ok": True,
                "enabled": bool(STRIPE_SECRET_KEY),
                "publishable_key": STRIPE_PUBLISHABLE_KEY
            })
            return

        # Retain the existing Sites-hosted Ideal Postcodes connection after migration.
        if path in ("/api/forms-config", "/api/postcode"):
            if path == "/api/forms-config":
                self.send_json({
                    "postcode": True,
                    "server_quotes": quote_service.enabled(),
                    "enquiry": is_email_delivery_configured(),
                    "booking": True
                })
                return
            postcode = re.sub(r"\s+", "", query.get("postcode", [""])[0]).upper()
            page = query.get("page", ["0"])[0]
            if not re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}", postcode) or not page.isdigit() or int(page) > 20:
                self.send_json({"error": "Enter a complete UK postcode."}, 400)
                return
            cache_key = postcode + "/" + page
            cached = POSTCODE_CACHE.get(cache_key)
            if cached and cached[0] > time.time():
                self.send_json(cached[1]); return
            try:
                url = "https://ga-chauffeur-services.giovichy44.chatgpt.site/api/postcode?" + urllib.parse.urlencode({"postcode":postcode,"page":page})
                request = urllib.request.Request(url, headers={
                    "User-Agent": "GAChauffeurs-PostcodeProxy/1.0 (+https://gachauffeurs.co.uk)",
                    "Accept": "application/json",
                })
                with urllib.request.urlopen(request, timeout=10) as response:
                    result = json.loads(response.read(200000))
                if not isinstance(result, dict) or not isinstance(result.get("addresses"), list):
                    raise ValueError("Invalid postcode response")
                if len(POSTCODE_CACHE) >= 200: POSTCODE_CACHE.clear()
                POSTCODE_CACHE[cache_key] = (time.time() + 900, result)
                self.send_json(result)
            except urllib.error.HTTPError as error:
                # Log status only: do not expose addresses, credentials or upstream bodies.
                print(f"Postcode upstream HTTP {error.code}", file=sys.stderr, flush=True)
                if error.code == 404:
                    self.send_json({"error": "No properties found. Check the postcode or enter your full address."}, 404)
                else:
                    self.send_json({"error": "House-number lookup is temporarily unavailable. Please enter the full address."}, 503)
            except Exception as error:
                print(f"Postcode upstream failure: {type(error).__name__}", file=sys.stderr, flush=True)
                self.send_json({"error": "House-number lookup is temporarily unavailable. Please enter the full address."}, 503)
            return

        if path == "/api/route-quote":
            try:
                result = quote_service.issue({key:values[0] for key,values in query.items()}, normalize_vehicle_tier, calculate_fare, self.client_address[0])
                self.send_json(result)
            except QuoteUnavailable as error:
                self.send_json({"error": str(error)}, 422)
            except Exception as error:
                print(f"Route quote failure: {type(error).__name__}", file=sys.stderr, flush=True)
                self.send_json({"error": "We could not verify this driving route. Please try again."}, 503)
            return

        if path == "/api/quote":
            pickup = query.get("pickup", [""])[0]
            dropoff = query.get("dropoff", [""])[0]
            if quote_service.enabled() and pickup.strip() and dropoff.strip():
                try:
                    data={key:values[0] for key,values in query.items()}
                    if 'hourly' not in str(data.get('service_type','')).lower(): data['hours']=0
                    q=quote_service.issue(data,normalize_vehicle_tier,calculate_fare,self.client_address[0])
                    q.update(net_fare=q['base_fare'],subtotal=round(q['total_fare']-q['vat_amount'],2),has_parking=q['parking_fee']>0,has_congestion=q['congestion_charge']>0)
                    self.send_json(q)
                except QuoteUnavailable as error:self.send_json({"error":str(error)},422)
                except Exception:self.send_json({"error":"Verified quote unavailable"},503)
                return
            vehicle = query.get("vehicle", ["mercedes_s_class"])[0]
            service_type = query.get("service_type", [None])[0]
            hours = query.get("hours", [0])[0]
            distance = float(query.get("distance", [15.0])[0])
            fare_info = calculate_fare(vehicle, service_type, pickup, dropoff, hours, distance)
            self.send_json(fare_info)
            return

        if path == "/api/suggestions":
            q_raw = query.get("q", [""])[0].strip()
            q = q_raw.lower().replace("’", "'")
            q_norm = q.replace("'", "")
            if not q:
                # Return popular top airports and luxury hotel destinations
                popular = UK_AUTOCOMPLETE_DATABASE[:6] + [i for i in UK_AUTOCOMPLETE_DATABASE if i.get("category") == "hotel"][:6]
                self.send_json({"suggestions": popular})
                return

            results = []
            for item in UK_AUTOCOMPLETE_DATABASE:
                title = item["title"].lower()
                title_norm = title.replace("'", "")
                subtitle = item["subtitle"].lower()
                code = item.get("code", "").lower()

                score = 0
                if q == code or q_norm == code or (q in ("t5", "t2", "t3", "t4") and f"terminal {q[1]}" in title):
                    score = 100
                elif q in code or q in title or q_norm in title_norm:
                    score = 60
                elif q in subtitle:
                    score = 30

                if score > 0:
                    results.append((score, item))

            results.sort(key=lambda x: x[0], reverse=True)
            matched = [item for _, item in results]

            gkey = os.environ.get("GOOGLE_MAPS_SERVER_KEY", "").strip()
            if len(q_raw) >= 2 and gkey and len(matched) < 10:
                try:
                    g_url = "https://maps.googleapis.com/maps/api/place/autocomplete/json?" + urllib.parse.urlencode({
                        "input": q_raw,
                        "components": "country:gb",
                        "key": gkey
                    })
                    req = urllib.request.Request(g_url, headers={"User-Agent": "GAChauffeurs-Dispatch/1.0"})
                    with urllib.request.urlopen(req, timeout=4, context=_get_ssl_context()) as resp:
                        g_data = json.loads(resp.read(65536))
                    for pred in g_data.get("predictions", [])[:8]:
                        fmt = pred.get("structured_formatting") or {}
                        main_txt = fmt.get("main_text") or pred.get("description", "")
                        sec_txt = fmt.get("secondary_text") or ""
                        full_desc = pred.get("description") or f"{main_txt}, {sec_txt}".strip(", ")
                        if not any(m["title"].lower() == main_txt.lower() for m in matched):
                            matched.append({
                                "title": main_txt,
                                "subtitle": sec_txt,
                                "full_address": full_desc,
                                "category": "airport" if "airport" in full_desc.lower() or "terminal" in full_desc.lower() else ("hotel" if "hotel" in full_desc.lower() else "address")
                            })
                except Exception:
                    pass

            self.send_json({"suggestions": matched[:12], "query": q_raw})
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

        if path == "/api/flight-webhook":
            if len(post_data)>500000:
                self.send_json({"error":"Payload too large"},413);return
            conn=db.get_connection()
            try:
                flight_monitor.receive(conn,post_data,self.headers.get('x-flightbyte-signature',''))
                self.send_json({"ok":True})
            except (flight_monitor.MonitoringUnavailable,ValueError,TypeError):
                self.send_json({"error":"Webhook could not be verified"},400)
            finally:conn.close()
            return

        # Login endpoint (Public)
        if path == "/api/login":
            username = payload.get("username", "").strip()
            password = payload.get("password", "")
            if check_credentials(username, password):
                token = get_auth_token()
                body = json.dumps({"success": True, "token": token}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Set-Cookie", f"ga_dispatch_auth={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
                return
            else:
                self.send_json({"error": "Invalid username or password"}, 401)
                return

        # Check authentication for private POST endpoints
        if not is_public_request("POST", path):
            if not check_auth(self.headers):
                self.send_json({"error": "Unauthorized. GA Dispatch is private."}, 401)
                return

        if path == "/api/flight-monitor":
            conn=db.get_connection()
            try:
                booking_id=str(payload.get('booking_id',''))
                if not conn.execute('SELECT 1 FROM bookings WHERE id=?',(booking_id,)).fetchone():
                    self.send_json({"error":"Booking not found"},404);return
                result=flight_monitor.subscribe(conn,booking_id,payload)
                self.send_json(result)
            except flight_monitor.MonitoringUnavailable as error:
                self.send_json({"error":str(error)},422)
            finally:conn.close()
            return

        if path == "/api/bookings":
            self.handle_create_booking(payload)
            return

        if path == "/api/enquiry":
            self.handle_create_enquiry(payload)
            return

        if path == "/api/settings/email":
            self.handle_update_email_settings(payload)
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

        if path.endswith("/capture-payment"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_capture_payment(booking_id, payload)
            return

        if path.endswith("/payment-link"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_create_payment_link(booking_id, payload)
            return

        if path.endswith("/manual-auth"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_manual_card_auth(booking_id, payload)
            return

        if path.endswith("/delete"):
            parts = path.split("/")
            booking_id = parts[3]
            self.handle_delete_booking(booking_id)
            return

        if path == "/api/bookings/clear-all":
            self.handle_clear_all_bookings()
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

        verified_quote = None
        if quote_service.enabled():
            try:
                verified_quote = quote_service.accept(payload, normalize_vehicle_tier)
            except QuoteUnavailable as error:
                self.send_json({"error": str(error)}, 409)
                return

        conn = db.get_connection()
        cursor = conn.cursor()

        booking_id = f"BK-{random.randint(1000, 9999)}"
        code = generate_confirmation_code()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        source = payload.get("source", "WEBSITE_GACHAUFFEURS" if "website" in str(payload.get("source", "")).lower() else "DISPATCH_PORTAL")

        normalized_vehicle = normalize_vehicle_tier(payload["vehicle_class"])
        detected_service = detect_service_type(payload["pickup_address"], payload["dropoff_address"], payload.get("service_type"))
        service_type = payload.get("service_type") or detected_service
        hours_booked = int(payload.get("hours_booked", payload.get("hours", 0)) or 0)
        if verified_quote:
            subtotal = round(verified_quote["total_fare"] - verified_quote["vat_amount"], 2)
            net_fare = verified_quote["base_fare"]
            parking_fee = verified_quote["parking_fee"]
            dropoff_fee = verified_quote["dropoff_fee"]
            congestion_charge = verified_quote["congestion_charge"]
            vat_amount = verified_quote["vat_amount"]
            total_fare = verified_quote["total_fare"]
            distance_mi = verified_quote["distance_miles"]
            duration_min = round(verified_quote["duration_minutes"])
            pickup_lat, pickup_lng = (verified_quote["pickup_location"][k] for k in ("lat", "lng"))
            dropoff_lat, dropoff_lng = (verified_quote["dropoff_location"][k] for k in ("lat", "lng"))

        else:
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
            parking_fee = fare_result.get("parking_fee", 0.0)
            dropoff_fee = fare_result.get("dropoff_fee", 0.0)
            congestion_charge = float(payload.get("congestion_charge", fare_result.get("congestion_charge", 0.0)))
            subtotal = round(net_fare + parking_fee + dropoff_fee + congestion_charge, 2)
            vat_amount = round((net_fare + parking_fee + dropoff_fee) * 0.20, 2)
            total_fare = round(subtotal + vat_amount, 2)
            # Legacy mode only; signed-quote mode above never trusts browser totals.
            if payload.get("total_fare"):
                try:
                    legacy_total=float(payload["total_fare"])
                    if math.isfinite(legacy_total) and legacy_total>0: total_fare=round(legacy_total,2)
                except (ValueError,TypeError): pass

        # Credit Card Payment Pre-Authorization Processing (Strict Stripe Verification)
        payment_method_id = payload.get("payment_method_id")
        stripe_intent_id = None
        card_num_raw = str(payload.get("card_number") or payload.get("cardNumber") or "").replace(" ", "").replace("-", "")
        card_holder = payload.get("cardholder_name") or payload.get("cardholderName") or payload.get("customer_name") or ""
        card_exp = payload.get("card_expiry") or payload.get("cardExpiry") or ""
        card_cvc = payload.get("card_cvc") or payload.get("cardCvc") or ""

        payment_status = "PENDING_PAYMENT"
        payment_method = "INVOICE"
        card_brand = None
        card_last4 = None
        card_auth_code = None
        preauth_amount = 0.0
        preauth_at = None

        existing_intent=payload.get('payment_intent_id')
        test_no_charge = bool(payload.get("test_no_charge") or str(payload.get("payment_mode", "")).upper() == "TEST_PREAUTH")
        binding_fields=['customer_name','customer_email','customer_phone','pickup_address','dropoff_address','pickup_datetime','vehicle_class','service_type','hours','passenger_count','large_cases','medium_cases','hand_luggage']
        binding=hashlib.sha256(json.dumps({k:payload.get(k) for k in binding_fields},sort_keys=True).encode()).hexdigest()
        if test_no_charge:
            payment_method = "TEST_PREAUTH"
            payment_status = "PRE_AUTHORIZED"
            card_brand = str(payload.get("card_brand") or "Visa (Test — No Charge)")
            card_last4 = str(payload.get("card_last4") or "4242")[-4:]
            card_auth_code = f"TEST-HOLD-{code}"
            preauth_amount = total_fare
            preauth_at = now_str
        elif STRIPE_SECRET_KEY and (payment_method_id or existing_intent or (card_num_raw and len(card_num_raw) >= 12)):
            if existing_intent:
                prior=cursor.execute('SELECT id,confirmation_code,total_fare,payment_status FROM bookings WHERE stripe_payment_intent_id=?',(existing_intent,)).fetchone()
                if prior:
                    conn.close(); self.send_json({'error':'This payment has already been used for a booking. Contact us with your payment reference.'},409); return
            pm_id = payment_method_id
            if not pm_id and card_num_raw:
                pm_res = stripe_create_payment_method_from_card(card_num_raw, card_exp, card_cvc, card_holder)
                if pm_res.get("error"):
                    conn.close()
                    self.send_json({"error": f"Card validation error: {pm_res['error']}"}, 400)
                    return
                pm_id = pm_res["id"]

            stripe_res = stripe_create_preauth_hold(
                amount_gbp=total_fare,
                payment_method_id=pm_id,
                customer_email=payload.get("customer_email"),
                customer_name=payload.get("customer_name"),
                description=f"GA Chauffeur Booking {code}", binding=binding, existing_intent=existing_intent
            )
            if stripe_res.get('requires_action'):
                conn.close();self.send_json(stripe_res);return
            if "error" in stripe_res:
                conn.close()
                self.send_json({"error": f"Card pre-authorisation declined by Stripe: {stripe_res['error']}"}, 400)
                return

            # Explicit check of Stripe status
            stripe_status = stripe_res.get("status")
            if stripe_status not in ("requires_capture", "succeeded"):
                conn.close()
                self.send_json({"error": f"Stripe pre-authorisation hold could not be verified (status: {stripe_status})."}, 400)
                return

            payment_method = "STRIPE"
            payment_status = "PRE_AUTHORIZED"
            card_brand = stripe_res.get("brand", "Card")
            card_last4 = stripe_res.get("last4", "••••")
            card_auth_code = stripe_res["payment_intent_id"]
            stripe_intent_id = stripe_res["payment_intent_id"]
            preauth_amount = total_fare
            preauth_at = now_str
        elif card_num_raw and len(card_num_raw) >= 12:
            # Card entered but Stripe is not configured: record as PENDING_PAYMENT, NEVER falsely claim PRE_AUTHORIZED
            payment_method = "CREDIT_CARD"
            payment_status = "PENDING_PAYMENT"
            if card_num_raw.startswith("4"):
                card_brand = "Visa"
            elif card_num_raw.startswith(("51", "52", "53", "54", "55", "22", "23", "24", "25", "26", "27")):
                card_brand = "Mastercard"
            elif card_num_raw.startswith(("34", "37")):
                card_brand = "American Express"
            else:
                card_brand = "Card"
            card_last4 = card_num_raw[-4:]
            card_auth_code = None
            preauth_amount = 0.0
            preauth_at = None

        flight_num = payload.get("flight_number")
        flight_status = "Manual flight check required — automatic monitoring not connected" if flight_num else None

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
            parking_fee, congestion_charge, payment_status, payment_method,
            card_brand, card_last4, card_auth_code, preauth_amount, preauth_at,
            stripe_payment_intent_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            booking_id, code, payload["customer_name"], payload["customer_phone"], payload["customer_email"],
            payload.get("vip_level", "Executive"), service_type, payload["pickup_address"], pickup_unit,
            pickup_lat, pickup_lng, payload["dropoff_address"], dropoff_unit, dropoff_lat, dropoff_lng,
            payload["pickup_datetime"], hours_booked, flight_num, flight_status, normalized_vehicle,
            passenger_count, luggage_count, large_cases, medium_cases, hand_luggage,
            payload.get("special_requests", ""), distance_mi, duration_min,
            net_fare, vat_amount, total_fare, "GBP", source, "CONFIRMED", None,
            parking_fee, congestion_charge, payment_status, payment_method,
            card_brand, card_last4, card_auth_code, preauth_amount, preauth_at,
            stripe_intent_id, now_str, now_str
        ))

        cursor.execute("UPDATE bookings SET dropoff_fee=? WHERE id=?", (dropoff_fee, booking_id))

        vehicle_name = VEHICLE_CONFIGS[normalized_vehicle]["name"]
        full_pickup_addr = payload["pickup_address"] + (f" ({pickup_unit})" if pickup_unit else "")
        full_dropoff_addr = payload["dropoff_address"] + (f" ({dropoff_unit})" if dropoff_unit else "")
        special_req_str = payload.get("special_requests", "") or ""
        email_subject = f"Booking Confirmation: {code} - GA Chauffeur Services Limited"
        html_email = build_luxury_email_html(
            booking_ref=code,
            customer_name=payload["customer_name"],
            pickup_addr=full_pickup_addr,
            dropoff_addr=full_dropoff_addr,
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
            flight=flight_num,
            parking_fee=parking_fee,
            dropoff_fee=dropoff_fee,
            congestion_charge=congestion_charge,
            card_brand=card_brand,
            card_last4=card_last4,
            card_auth_code=card_auth_code,
            duration_min=duration_min,
            hours_booked=hours_booked,
            distance_mi=distance_mi,
            special_requests=special_req_str,
            customer_phone=payload["customer_phone"],
            customer_email=payload["customer_email"],
            payment_status=payment_status
        )

        plain_text_email = build_luxury_email_text(
            booking_ref=code,
            customer_name=payload["customer_name"],
            pickup_addr=full_pickup_addr,
            dropoff_addr=full_dropoff_addr,
            pickup_dt=payload["pickup_datetime"],
            vehicle_name=vehicle_name,
            net_fare=net_fare,
            vat_amt=vat_amount,
            total_fare=total_fare,
            service_type=service_type,
            passengers=passenger_count,
            large_cases=large_cases,
            medium_cases=medium_cases,
            hand_luggage=hand_luggage,
            flight=flight_num,
            special_requests=special_req_str,
            parking_fee=parking_fee,
            dropoff_fee=dropoff_fee,
            congestion_charge=congestion_charge,
            card_brand=card_brand,
            card_last4=card_last4,
            card_auth_code=card_auth_code,
            duration_min=duration_min,
            hours_booked=hours_booked,
            distance_mi=distance_mi
        )

        send_success, delivery_note = send_smtp_email(payload["customer_email"], email_subject, html_email, plain_text_email)
        owner_inbox = (os.environ.get("FROM_EMAIL", FROM_EMAIL).strip() or db.get_setting("from_email", "")).strip() or "enquiries@gachauffeurs.co.uk"
        owner_subject = f"🚨 NEW BOOKING {code}: {payload['customer_name']} — {payload['pickup_datetime']} ({vehicle_name}) [£{total_fare:.2f}]"
        owner_html = build_owner_booking_alert_html(
            booking_ref=code,
            customer_name=payload["customer_name"],
            customer_phone=payload["customer_phone"],
            customer_email=payload["customer_email"],
            pickup_addr=full_pickup_addr,
            dropoff_addr=full_dropoff_addr,
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
            flight=flight_num,
            special_requests=special_req_str,
            parking_fee=parking_fee,
            dropoff_fee=dropoff_fee,
            congestion_charge=congestion_charge,
            card_brand=card_brand,
            card_last4=card_last4,
            card_auth_code=card_auth_code,
            payment_status=payment_status,
            source=source,
            duration_min=duration_min,
            hours_booked=hours_booked,
            distance_mi=distance_mi
        )
        owner_text = (
            f"NEW BOOKING ALERT — {code}\n"
            f"Source: {source}\n"
            f"Customer: {payload['customer_name']}\n"
            f"Phone: {payload['customer_phone']}\n"
            f"Email: {payload['customer_email']}\n\n"
            + plain_text_email
        )
        send_smtp_email(owner_inbox, owner_subject, owner_html, owner_text, reply_to=payload["customer_email"])
        cnf_email_id = f"CNF-{random.randint(1000, 9999)}"
        email_status = "DELIVERED" if send_success else "FAILED"

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_email_id, booking_id, "EMAIL", payload["customer_email"],
            email_subject, plain_text_email, email_status, now_str
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
            "base_fare": net_fare,
            "net_fare": net_fare,
            "parking_fee": parking_fee,
            "congestion_charge": congestion_charge,
            "subtotal": subtotal,
            "vat_amount": vat_amount,
            "total_fare": total_fare,
            "fare_amount": net_fare,
            "service_type": service_type,
            "currency": "GBP",
            "distance_mi": distance_mi,
            "duration_min": duration_min,
            "status": "CONFIRMED",
            "payment_status": payment_status,
            "payment_method": payment_method,
            "card_brand": card_brand,
            "card_last4": card_last4,
            "card_auth_code": card_auth_code,
            "preauth_amount": preauth_amount,
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
            flight=booking.get('flight_number'),
            parking_fee=booking.get('parking_fee',0),
            dropoff_fee=booking.get('dropoff_fee',0),
            congestion_charge=booking.get('congestion_charge',0)
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

        send_success, _ = send_smtp_email(booking["customer_email"], email_subject, html_email, plain_text_email)

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cnf_email_id, booking_id, "EMAIL", booking["customer_email"],
            email_subject, plain_text_email, "DELIVERED" if send_success else "FAILED", now_str
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

    def handle_delete_booking(self, booking_id):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, confirmation_code, chauffeur_id FROM bookings WHERE id = ? OR confirmation_code = ?", (booking_id, booking_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return
        b_id = row["id"]
        if row["chauffeur_id"]:
            cursor.execute("UPDATE chauffeurs SET status = 'AVAILABLE', active_booking_id = NULL WHERE id = ?", (row["chauffeur_id"],))
        cursor.execute("DELETE FROM confirmations WHERE booking_id = ?", (b_id,))
        cursor.execute("DELETE FROM action_logs WHERE booking_id = ?", (b_id,))
        cursor.execute("DELETE FROM bookings WHERE id = ?", (b_id,))
        conn.commit()
        conn.close()
        broadcast_event("booking_deleted", {"booking_id": b_id})
        self.send_json({"success": True, "deleted_id": b_id})

    def handle_clear_all_bookings(self):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM confirmations")
        cursor.execute("DELETE FROM action_logs")
        cursor.execute("DELETE FROM bookings")
        cursor.execute("UPDATE chauffeurs SET status = 'AVAILABLE', active_booking_id = NULL")
        conn.commit()
        conn.close()
        broadcast_event("system_reset", {"message": "All bookings cleared"})
        self.send_json({"success": True, "message": "All bookings cleared from Dispatch Console."})

    def handle_live_action(self, booking_id, payload):
        action = payload.get("action", "").upper()
        allowed = ["CONFIRMED", "ACCEPT", "EN_ROUTE_PICKUP", "ARRIVED", "ON_BOARD", "NEXT_STOP", "COMPLETED", "CANCEL"]
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

        if action in ("ACCEPT", "CONFIRMED"):
            new_booking_status = "CONFIRMED" if action == "CONFIRMED" else "ACCEPTED"
            details = f"Chauffeur {chauffeur['name'] if chauffeur else 'Dispatch'} confirmed and locked in the booking."

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

        elif action == "NEXT_STOP":
            new_booking_status = "NEXT_STOP"
            stop_note = payload.get("stop_note") or booking['dropoff_address']
            details = f"En route to next stop: {stop_note}."
            sms_alert = f"GA Chauffeurs: Proceeding to next stop ({stop_note}) for booking {booking['confirmation_code']}."

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

            # If a card pre-authorisation hold exists, capture it upon completion
            card_code = booking.get("card_auth_code") or ""
            if booking.get("payment_status") == "PRE_AUTHORIZED":
                if card_code.startswith("pi_") and STRIPE_SECRET_KEY:
                    cap_res = stripe_capture_hold(card_code)
                    if not cap_res.get("error"):
                        cursor.execute("UPDATE bookings SET payment_status = 'PAID' WHERE id = ?", (booking_id,))
                        details += f" Stripe pre-authorisation hold of £{booking['total_fare']:.2f} successfully captured ({card_code})."
                    else:
                        details += f" Stripe pre-authorisation capture pending: {cap_res.get('error')}."
                else:
                    cursor.execute("UPDATE bookings SET payment_status = 'PAID' WHERE id = ?", (booking_id,))
                    details += f" Card pre-authorisation hold of £{booking['total_fare']:.2f} captured ({card_code})."

            cnf_rec_id = f"CNF-{random.randint(1000, 9999)}"
            receipt_subject = f"Official Receipt: {booking['confirmation_code']} - GA Chauffeur Services Limited"
            receipt_content = (
                f"GA Chauffeur Services Limited - Official Trip Receipt\n\n"
                f"Booking Reference: {booking['confirmation_code']}\n"
                f"Passenger: {booking['customer_name']}\n"
                f"Chauffeur: {chauffeur['name'] if chauffeur else 'GA Executive Chauffeur'}\n"
                f"Route: {booking['pickup_address']} -> {booking['dropoff_address']}\n"
                f"Distance: {booking['estimated_distance_mi']} miles\n"
                f"Total Charged: £{booking.get('total_fare') or booking['fare_amount']:.2f} GBP\n\n"
                f"Thank you for traveling with GA Chauffeur Services Limited (gachauffeurs.co.uk)."
            )
            rec_html = build_luxury_email_html(
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
                flight=booking.get('flight_number'),
                parking_fee=booking.get('parking_fee', 0),
                dropoff_fee=booking.get('dropoff_fee', 0),
                congestion_charge=booking.get('congestion_charge', 0),
                card_brand=booking.get('card_brand'),
                card_last4=booking.get('card_last4'),
                card_auth_code=booking.get('card_auth_code')
            )
            rec_sent, _ = send_smtp_email(booking["customer_email"], receipt_subject, rec_html, receipt_content)
            cursor.execute("""
            INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cnf_rec_id, booking_id, "EMAIL", booking["customer_email"],
                receipt_subject, receipt_content, "DELIVERED" if rec_sent else "FAILED", now_str
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

    def handle_capture_payment(self, booking_id, payload):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        b_row = cursor.fetchone()
        if not b_row:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(b_row)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        card_code = booking.get("card_auth_code") or ""
        amount = float(payload.get("amount", booking.get("total_fare", 0.0)))

        if card_code.startswith("pi_") and STRIPE_SECRET_KEY:
            res = stripe_capture_hold(card_code, amount)
            if "error" in res:
                conn.close()
                self.send_json({"error": f"Stripe capture failed: {res['error']}"}, 400)
                return
            cursor.execute("UPDATE bookings SET payment_status = 'PAID', updated_at = ? WHERE id = ?", (now_str, booking_id))
            cursor.execute("""
            INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (booking_id, booking.get("chauffeur_id"), "STRIPE_CAPTURE_SUCCESS", "Dispatch Control", f"Captured £{amount:.2f} via Stripe PaymentIntent {card_code}.", now_str))
            conn.commit()
            conn.close()
            broadcast_event("payment_captured", {"booking_id": booking_id, "amount": amount, "method": "STRIPE"})
            self.send_json({"success": True, "payment_status": "PAID", "amount_captured": amount, "reference": card_code})
        else:
            cursor.execute("UPDATE bookings SET payment_status = 'PAID', updated_at = ? WHERE id = ?", (now_str, booking_id))
            cursor.execute("""
            INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (booking_id, booking.get("chauffeur_id"), "PREAUTH_CAPTURE_SUCCESS", "Dispatch Control", f"Captured £{amount:.2f} against pre-authorisation {card_code}.", now_str))
            conn.commit()
            conn.close()
            broadcast_event("payment_captured", {"booking_id": booking_id, "amount": amount, "method": "PRE_AUTH"})
            self.send_json({"success": True, "payment_status": "PAID", "amount_captured": amount, "reference": card_code})

    def handle_create_payment_link(self, booking_id, payload):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bookings WHERE id = ? OR confirmation_code = ?", (booking_id, booking_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(row)
        amount = float(payload.get("amount", booking.get("total_fare", 0.0)))
        ref = booking.get("confirmation_code", booking["id"])
        email = booking.get("customer_email", "")
        name = booking.get("customer_name", "")
        desc = f"{booking.get('service_type', 'Chauffeur Journey')}: {booking.get('pickup_address', '')} to {booking.get('dropoff_address', '')}"

        res = stripe_create_checkout_session(amount, ref, email, name, desc)
        conn.close()
        if res.get("error"):
            self.send_json({"error": res["error"]}, 400)
            return

        self.send_json(res)

    def handle_manual_card_auth(self, booking_id, payload):
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bookings WHERE id = ? OR confirmation_code = ?", (booking_id, booking_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_json({"error": "Booking not found"}, 404)
            return

        booking = dict(row)
        test_no_charge = bool(payload.get("test_no_charge"))
        card_num_raw = str(payload.get("card_number") or "").replace(" ", "").replace("-", "")
        card_holder = payload.get("cardholder_name") or booking.get("customer_name") or ""
        card_exp = payload.get("card_expiry") or ""
        card_cvc = payload.get("card_cvc") or ""
        amount = float(payload.get("amount", booking.get("total_fare", 0.0)))

        if test_no_charge:
            stripe_res = {
                "brand": "Visa (Test — No Charge)",
                "last4": "4242",
                "payment_intent_id": f"TEST-HOLD-{booking.get('confirmation_code', booking_id)}"
            }
        else:
            pm_res = stripe_create_payment_method_from_card(card_num_raw, card_exp, card_cvc, card_holder)
            if pm_res.get("error"):
                conn.close()
                self.send_json({"error": f"Card error: {pm_res['error']}"}, 400)
                return

            stripe_res = stripe_create_preauth_hold(
                amount_gbp=amount,
                payment_method_id=pm_res["id"],
                customer_email=booking.get("customer_email"),
                customer_name=booking.get("customer_name"),
                description=f"Manual Pre-Auth: GA Chauffeur Booking {booking.get('confirmation_code', booking_id)}"
            )
            if "error" in stripe_res:
                conn.close()
                self.send_json({"error": f"Pre-authorisation declined: {stripe_res['error']}"}, 400)
                return

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            UPDATE bookings SET
                payment_status = 'PRE_AUTHORIZED',
                payment_method = ?,
                card_brand = ?,
                card_last4 = ?,
                card_auth_code = ?,
                preauth_amount = ?,
                preauth_at = ?,
                stripe_payment_intent_id = ?,
                updated_at = ?
            WHERE id = ?
        """, (
            "TEST_PREAUTH" if test_no_charge else "STRIPE",
            stripe_res.get("brand", "Card"),
            stripe_res.get("last4", "••••"),
            stripe_res["payment_intent_id"],
            amount,
            now_str,
            stripe_res["payment_intent_id"],
            now_str,
            booking["id"]
        ))

        code = booking.get("confirmation_code", booking["id"])
        norm_veh = normalize_vehicle_tier(booking.get("vehicle_class", "mercedes_s_class"))
        veh_name = VEHICLE_CONFIGS[norm_veh]["name"]
        email_subject = f"Booking Confirmation: {code} - GA Chauffeur Services Limited"
        html_email = build_luxury_email_html(
            booking_ref=code,
            customer_name=booking.get("customer_name", ""),
            pickup_addr=booking.get("pickup_address", ""),
            dropoff_addr=booking.get("dropoff_address", ""),
            pickup_dt=booking.get("pickup_datetime", ""),
            vehicle_tier=norm_veh,
            net_fare=booking.get("fare_amount", 165.0),
            vat_amt=booking.get("vat_amount"),
            total_fare=amount,
            service_type=booking.get("service_type", "Airport Transfer"),
            passengers=booking.get("passenger_count", 1),
            large_cases=booking.get("large_cases", 0),
            medium_cases=booking.get("medium_cases", 0),
            hand_luggage=booking.get("hand_luggage", 0),
            flight=booking.get("flight_number"),
            parking_fee=booking.get("parking_fee", 0.0),
            dropoff_fee=booking.get("dropoff_fee", 0.0),
            congestion_charge=booking.get("congestion_charge", 0.0),
            card_brand=stripe_res.get("brand", "Card"),
            card_last4=stripe_res.get("last4", "••••"),
            card_auth_code=stripe_res["payment_intent_id"],
            duration_min=booking.get("estimated_duration_min", 0),
            hours_booked=booking.get("hours_booked", 0),
            distance_mi=booking.get("estimated_distance_mi", 0.0),
            special_requests=booking.get("special_requests", ""),
            customer_phone=booking.get("customer_phone", ""),
            customer_email=booking.get("customer_email", ""),
            payment_status="PRE_AUTHORIZED"
        )
        plain_text_email = build_luxury_email_text(
            booking_ref=code,
            customer_name=booking.get("customer_name", ""),
            pickup_addr=booking.get("pickup_address", ""),
            dropoff_addr=booking.get("dropoff_address", ""),
            pickup_dt=booking.get("pickup_datetime", ""),
            vehicle_name=veh_name,
            net_fare=booking.get("fare_amount", 165.0),
            vat_amt=booking.get("vat_amount") or 0.0,
            total_fare=amount,
            service_type=booking.get("service_type", "Airport Transfer"),
            passengers=booking.get("passenger_count", 1),
            large_cases=booking.get("large_cases", 0),
            medium_cases=booking.get("medium_cases", 0),
            hand_luggage=booking.get("hand_luggage", 0),
            flight=booking.get("flight_number"),
            special_requests=booking.get("special_requests", ""),
            parking_fee=booking.get("parking_fee", 0.0),
            dropoff_fee=booking.get("dropoff_fee", 0.0),
            congestion_charge=booking.get("congestion_charge", 0.0),
            card_brand=stripe_res.get("brand", "Card"),
            card_last4=stripe_res.get("last4", "••••"),
            card_auth_code=stripe_res["payment_intent_id"],
            duration_min=booking.get("estimated_duration_min", 0),
            hours_booked=booking.get("hours_booked", 0),
            distance_mi=booking.get("estimated_distance_mi", 0.0)
        )
        if booking.get("customer_email"):
            send_smtp_email(booking["customer_email"], email_subject, html_email, plain_text_email)
        owner_inbox = (os.environ.get("FROM_EMAIL", FROM_EMAIL).strip() or db.get_setting("from_email", "")).strip() or "enquiries@gachauffeurs.co.uk"
        owner_html = build_owner_booking_alert_html(
            booking_ref=code,
            customer_name=booking.get("customer_name", ""),
            customer_phone=booking.get("customer_phone", ""),
            customer_email=booking.get("customer_email", ""),
            pickup_addr=booking.get("pickup_address", ""),
            dropoff_addr=booking.get("dropoff_address", ""),
            pickup_dt=booking.get("pickup_datetime", ""),
            vehicle_tier=norm_veh,
            net_fare=booking.get("fare_amount", 165.0),
            vat_amt=booking.get("vat_amount") or 0.0,
            total_fare=amount,
            service_type=booking.get("service_type", "Airport Transfer"),
            passengers=booking.get("passenger_count", 1),
            large_cases=booking.get("large_cases", 0),
            medium_cases=booking.get("medium_cases", 0),
            hand_luggage=booking.get("hand_luggage", 0),
            flight=booking.get("flight_number"),
            special_requests=booking.get("special_requests", ""),
            parking_fee=booking.get("parking_fee", 0.0),
            dropoff_fee=booking.get("dropoff_fee", 0.0),
            congestion_charge=booking.get("congestion_charge", 0.0),
            card_brand=stripe_res.get("brand", "Card"),
            card_last4=stripe_res.get("last4", "••••"),
            card_auth_code=stripe_res["payment_intent_id"],
            payment_status="PRE_AUTHORIZED",
            source=booking.get("source", "DISPATCH_PORTAL"),
            duration_min=booking.get("estimated_duration_min", 0),
            hours_booked=booking.get("hours_booked", 0),
            distance_mi=booking.get("estimated_distance_mi", 0.0)
        )
        send_smtp_email(owner_inbox, f"🚨 CARD AUTHORISED & CONFIRMED {code}: {booking.get('customer_name', '')} [£{amount:.2f}]", owner_html, plain_text_email, reply_to=booking.get("customer_email"))

        conn.commit()
        conn.close()

        broadcast_event("payment_preauthorized", {"booking_id": booking["id"], "amount": amount, "method": "TEST_PREAUTH" if test_no_charge else "STRIPE"})
        self.send_json({"success": True, "message": "Card pre-authorised and confirmation email sent", "status": "PRE_AUTHORIZED", "payment_intent_id": stripe_res["payment_intent_id"]})

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
        resent_subject = conf["subject"] if "(Resent)" in conf["subject"] else conf["subject"] + " (Resent)"
        send_status = "DELIVERED"
        delivery_note = ""

        if conf["channel"] == "EMAIL":
            b_row = cursor.execute("SELECT * FROM bookings WHERE id = ?", (conf["booking_id"],)).fetchone()
            html_body = ""
            if b_row:
                booking = dict(b_row)
                ch_row = None
                if booking.get("chauffeur_id"):
                    ch_row = cursor.execute("SELECT * FROM chauffeurs WHERE id = ?", (booking["chauffeur_id"],)).fetchone()
                html_body = build_luxury_email_html(
                    booking_ref=booking["confirmation_code"],
                    customer_name=booking["customer_name"],
                    pickup_addr=booking["pickup_address"],
                    dropoff_addr=booking["dropoff_address"],
                    pickup_dt=booking["pickup_datetime"],
                    vehicle_tier=booking["vehicle_class"],
                    net_fare=booking.get("fare_amount", 165.0),
                    vat_amt=booking.get("vat_amount"),
                    total_fare=booking.get("total_fare"),
                    service_type=booking.get("service_type", "Airport Transfer"),
                    passengers=booking.get("passenger_count", 1),
                    large_cases=booking.get("large_cases", 0),
                    medium_cases=booking.get("medium_cases", 0),
                    hand_luggage=booking.get("hand_luggage", 0),
                    chauffeur=dict(ch_row) if ch_row else None,
                    flight=booking.get("flight_number"),
                    parking_fee=booking.get("parking_fee", 0),
                    dropoff_fee=booking.get("dropoff_fee", 0),
                    congestion_charge=booking.get("congestion_charge", 0),
                    card_brand=booking.get("card_brand"),
                    card_last4=booking.get("card_last4"),
                    card_auth_code=booking.get("card_auth_code"),
                    duration_min=booking.get("estimated_duration_min", 0),
                    hours_booked=booking.get("hours_booked", 0),
                    distance_mi=booking.get("estimated_distance_mi", 0.0),
                    special_requests=booking.get("special_requests", ""),
                    customer_phone=booking.get("customer_phone", ""),
                    customer_email=booking.get("customer_email", ""),
                    payment_status=booking.get("payment_status", "PRE_AUTHORIZED")
                )
            ok, delivery_note = send_smtp_email(conf["recipient"], resent_subject, html_body, conf["content"])
            send_status = "DELIVERED" if ok else "FAILED"

        cursor.execute("""
        INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, conf["booking_id"], conf["channel"], conf["recipient"],
            resent_subject, conf["content"], send_status, now_str
        ))

        cursor.execute("""
        INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (conf["booking_id"], None, "CONFIRMATION_RESENT", "Dispatcher", f"Resent {conf['channel']} to {conf['recipient']} ({send_status})", now_str))

        conn.commit()
        conn.close()

        broadcast_event("confirmation_resent", {"id": new_id, "booking_id": conf["booking_id"], "status": send_status})
        if send_status == "FAILED":
            self.send_json({"error": f"Failed to send email to {conf['recipient']}: {delivery_note}", "id": new_id}, 502)
            return
        self.send_json({"success": True, "message": f"Confirmation resent via {conf['channel']} to {conf['recipient']}", "id": new_id})

    def handle_create_enquiry(self, payload):
        name = str(payload.get("name") or "").strip()[:120]
        email = str(payload.get("email") or "").strip()[:160]
        phone = str(payload.get("phone") or "").strip()[:80]
        message = str(payload.get("message") or "").strip()[:4000]
        if not name or not email or not message or "@" not in email:
            self.send_json({"error": "Please enter your name, email address, and enquiry message."}, 400)
            return
        text_body = f"New Website Enquiry — GA Chauffeur Services Limited\n\nName: {name}\nEmail: {email}\nPhone: {phone}\n\nMessage:\n{message}"
        html_body = (
            f"<h3>New Website Enquiry — {COMPANY_NAME}</h3>"
            f"<p><strong>Name:</strong> {name}<br><strong>Email:</strong> {email}<br><strong>Phone:</strong> {phone}</p>"
            f"<pre style='white-space:pre-wrap;font-family:sans-serif;'>{message}</pre>"
        )
        ok_team, err_team = send_smtp_email("enquiries@gachauffeurs.co.uk", f"Website Enquiry from {name}", html_body, text_body, reply_to=email)
        if not ok_team:
            self.send_json({"ok": False, "error": err_team}, 502)
            return
        ack_text = f"Dear {name},\n\nThank you for contacting {COMPANY_NAME}. We have received your enquiry and will respond shortly.\n\nWarm regards,\n{COMPANY_NAME}\n{COMPANY_PHONE}"
        ack_html = f"<p>Dear {name},</p><p>Thank you for contacting <strong>{COMPANY_NAME}</strong>. We have received your enquiry and a member of our dispatch team will respond shortly.</p><p>Warm regards,<br><strong>{COMPANY_NAME}</strong><br>{COMPANY_PHONE}</p>"
        send_smtp_email(email, f"Enquiry Received | {COMPANY_NAME}", ack_html, ack_text)
        self.send_json({"ok": True})

    def handle_update_email_settings(self, payload):
        resend_key = str(payload.get("resend_api_key") or "").strip()
        from_email = str(payload.get("from_email") or "").strip()
        if resend_key:
            db.set_setting("resend_api_key", resend_key)
        if from_email:
            db.set_setting("from_email", from_email)
        test_to = str(payload.get("test_to") or "").strip()
        test_result = None
        if test_to:
            ok, msg = send_smtp_email(test_to, f"Email Delivery Verified | {COMPANY_NAME}", "<p>Outbound confirmation emails are active.</p>", "Outbound confirmation emails are active.")
            test_result = {"ok": ok, "message": msg}
        self.send_json({"ok": True, "configured": is_email_delivery_configured(), "test": test_result})

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

    def keep_render_awake():
        """Send periodic external HTTP requests through the public domain so Render's edge proxy never spins down the service."""
        urls = [
            "https://gachauffeurs.co.uk/api/forms-config",
            "https://dispatch.gachauffeurs.co.uk/api/forms-config"
        ]
        while True:
            time.sleep(240)
            for u in urls:
                try:
                    req = urllib.request.Request(
                        u,
                        headers={"User-Agent": "GAChauffeurs-KeepAlive/1.0 (+https://gachauffeurs.co.uk)"}
                    )
                    with urllib.request.urlopen(req, timeout=10, context=_get_ssl_context()) as resp:
                        resp.read(64)
                except Exception:
                    pass

    keepalive_thread = threading.Thread(target=keep_render_awake, daemon=True)
    keepalive_thread.start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.shutdown()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else PORT))
    run_server(port)
