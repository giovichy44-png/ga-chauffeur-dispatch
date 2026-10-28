# GA Chauffeur Services Limited — Dispatch OS & Mobile App 🚘🇬🇧

Official executive dispatch, automated confirmations, live chauffeur actions, and mobile Progressive Web App (PWA) for **GA Chauffeur Services Limited** ([gachauffeurs.co.uk](https://gachauffeurs.co.uk)).

---

## 🌟 What Has Been Built & Configured

### 1. Re-Branded for GA Chauffeur Services Limited
- **Branding**: GA Chauffeur Services Limited (`gachauffeurs.co.uk`).
- **Currency**: £ GBP throughout fare calculator, vouchers, and receipts.
- **Reference Codes**: `GA-XXXXX` format (e.g. `GA-84920`).
- **London Fleet & Corridors**: Mercedes-Benz S-Class, Range Rover Autobiography, BMW i7, Mercedes-Benz V-Class XL, covering Heathrow (LHR), Gatwick (LGW), London City (LCY), Farnborough (FAB FBO), Mayfair, Canary Wharf, Knightsbridge, and the Home Counties.

### 2. Mobile-Friendly & Installable Mobile App (PWA)
- **Installable on iOS & Android**: Configured with `manifest.json`, Service Worker (`sw.js`), app icons, and full-screen standalone display mode.
- **Mobile Bottom Navigation Bar**: Fixed thumb-friendly navigation bar on phones with quick access to `Radar`, `Jobs`, `Driver App`, `New Job`, and `Outbox`.
- **Driver Handset Mode**: Chauffeurs can open their phone and execute live actions with one tap (`Accept Booking` $\rightarrow$ `En Route` $\rightarrow$ `Arrived` $\rightarrow$ `Passenger On Board` $\rightarrow$ `Complete Journey`).
- **How to Install on Mobile**:
  - **iPhone / iPad**: Open in Safari $\rightarrow$ Tap the **Share** button $\rightarrow$ Select **"Add to Home Screen"**.
  - **Android**: Open in Chrome $\rightarrow$ Tap the three dots **(⋮)** $\rightarrow$ Select **"Install App"** / **"Add to Home screen"**.

### 3. Website Integration for `gachauffeurs.co.uk`
When a customer requests a booking on your website:
1. The request is sent directly to `POST /api/bookings`.
2. The dispatch engine creates a job with reference format `GA-XXXXX`.
3. An automated luxury HTML booking confirmation is dispatched to the customer's email.
4. The job appears on your live dispatch radar and bookings board for allocation.

---

## 🔌 How to Hook This Up to Your Website (`gachauffeurs.co.uk`)

### Method A: Single-Line Drop-In Booking Widget
Paste this snippet onto any page of `gachauffeurs.co.uk` (WordPress, Squarespace, Wix, Webflow, or custom HTML):

```html
<!-- GA Chauffeur Services Booking Widget -->
<div id="ga-chauffeur-booking-widget"></div>
<script src="https://dispatch.gachauffeurs.co.uk/embed-booking-widget.js"></script>
```

> You can test this right now at: **`http://localhost:8080/widget-demo.html`**

---

### Method B: REST API Webhook
If you already have a booking form on `gachauffeurs.co.uk`, point your form submission or serverless webhook to:
```http
POST https://dispatch.gachauffeurs.co.uk/api/bookings
Content-Type: application/json

{
  "customer_name": "Lord Henry Cavendish",
  "customer_phone": "+44 7700 900891",
  "customer_email": "client@estate.co.uk",
  "pickup_address": "Heathrow Airport (LHR) Terminal 5",
  "dropoff_address": "The Connaught, Mayfair, London",
  "pickup_datetime": "2026-10-30 14:00",
  "flight_number": "BA 178",
  "vehicle_class": "first_class",
  "passenger_count": 2,
  "luggage_count": 3,
  "special_requests": "Meet & Greet with nameboard at Arrivals",
  "source": "WEBSITE_GACHAUFFEURS"
}
```

**Response:**
```json
{
  "success": true,
  "booking": {
    "id": "BK-6591",
    "confirmation_code": "GA-BNUZB",
    "reference_number": "GA-BNUZB",
    "fare_amount": 231.20,
    "currency": "GBP",
    "status": "CONFIRMED",
    "email_dispatched_to": "client@estate.co.uk"
  },
  "message": "Job GA-BNUZB created and confirmation email sent."
}
```

---

## 📋 What Else is Needed to Connect to Your Live Domain

To connect this system to your live domain `gachauffeurs.co.uk`, here is what is needed:

1. **DNS Subdomain**:
   - Create a DNS `A` or `CNAME` record in your domain registrar (e.g., GoDaddy, Namecheap, Cloudflare, 123 Reg):
     - Host: `dispatch` (points to `dispatch.gachauffeurs.co.uk`)
     - Value: Your cloud server IP or platform host (e.g. Hetzner, DigitalOcean, AWS, Render, Fly.io).

2. **Cloud Server / Hosting**:
   - The Python dispatch application runs on any Linux VPS or container (Docker / systemd service) requiring less than 50MB of RAM.

3. **Email Sending (SMTP Credentials)**:
   - To send actual live emails from `enquiries@gachauffeurs.co.uk`, set these environment variables on your server:
     - `SMTP_HOST` (e.g. `smtp.gmail.com` for Google Workspace, `smtp.office365.com` for Microsoft 365, or your cPanel/SendGrid/SES host)
     - `SMTP_PORT` (e.g. `587`)
     - `SMTP_USER` (e.g. `enquiries@gachauffeurs.co.uk`)
     - `SMTP_PASS` (your SMTP app password)
     - `FROM_EMAIL` (`enquiries@gachauffeurs.co.uk`)
   *(If not set, the system logs all generated emails in the live outbox table with full HTML preview and one-click resend).*

4. **SMS Gateway (Optional)**:
   - If you want SMS alerts to UK mobiles (e.g. via Twilio or MessageBird), provide your Twilio Account SID and Auth Token to hook into the SMS dispatcher.

5. **Website CMS Type**:
   - Let us know if `gachauffeurs.co.uk` is built with **WordPress**, **Squarespace**, **Wix**, **Webflow**, or **Custom Code** so we can provide the exact step-by-step instructions for placing the booking form.
