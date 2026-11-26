"""Dispatch invoice ledger. Money is stored in integer GBP pence."""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import escape
import json
import journey_stops
import os
import re
from zoneinfo import ZoneInfo
from urllib.parse import urlsplit

TABLES = ("invoice_clients", "invoice_items", "invoices", "invoice_payments", "invoice_preferences")
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")


def init(conn):
    for sql in (
        """CREATE TABLE IF NOT EXISTS invoice_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '')""",
        """CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, unit_pence INTEGER NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT UNIQUE,
            client_id INTEGER REFERENCES invoice_clients(id), client_name TEXT NOT NULL,
            client_email TEXT NOT NULL, client_address TEXT NOT NULL,
            issued TEXT NOT NULL, due TEXT NOT NULL, items TEXT NOT NULL, comments TEXT NOT NULL,
            discount_pence INTEGER NOT NULL, vat_percent TEXT NOT NULL, vat_pence INTEGER NOT NULL,
            subtotal_pence INTEGER NOT NULL, total_pence INTEGER NOT NULL,
            delivery TEXT NOT NULL DEFAULT 'draft', paid INTEGER NOT NULL DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS invoice_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
            kind TEXT NOT NULL, amount_pence INTEGER NOT NULL, noted_on TEXT NOT NULL, memo TEXT NOT NULL DEFAULT '',
            external_ref TEXT UNIQUE)""",
        """CREATE TABLE IF NOT EXISTS invoice_preferences (
            key TEXT PRIMARY KEY, value TEXT NOT NULL)""",
    ):
        conn.execute(sql)

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(invoice_clients)")}
    if "source_key" not in columns:
        conn.execute("ALTER TABLE invoice_clients ADD COLUMN source_key TEXT")
    if "source_details" not in columns:
        conn.execute("ALTER TABLE invoice_clients ADD COLUMN source_details TEXT NOT NULL DEFAULT '{}'")
    if "archived_at" not in columns:
        conn.execute("ALTER TABLE invoice_clients ADD COLUMN archived_at TEXT")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS invoice_client_source ON invoice_clients(source_key)")
    invoice_columns = {row["name"] for row in conn.execute("PRAGMA table_info(invoices)")}
    if "checkout_session" not in invoice_columns:
        conn.execute("ALTER TABLE invoices ADD COLUMN checkout_session TEXT")
    if "checkout_pence" not in invoice_columns:
        conn.execute("ALTER TABLE invoices ADD COLUMN checkout_pence INTEGER")
    if "manually_edited" not in invoice_columns:
        conn.execute("ALTER TABLE invoices ADD COLUMN manually_edited INTEGER NOT NULL DEFAULT 0")
    migrate_legacy_payments(conn)


def migrate_legacy_payments(conn):
    conn.execute("""INSERT OR IGNORE INTO invoice_payments(invoice_id,kind,amount_pence,noted_on,memo,external_ref)
        SELECT id,'payment',total_pence,issued,'Previously marked paid','legacy:'||id FROM invoices
        WHERE paid=1 AND total_pence>0 AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id=invoices.id)""")


PAYMENT_FIELDS = ("account_name", "sort_code", "account_number", "bic", "iban", "vat_number", "card_link")


def preferences(conn):
    return {row["key"]: row["value"] for row in conn.execute("SELECT key,value FROM invoice_preferences")}


def save_preferences(conn, payload):
    entries = {key: clean(payload.get(key), key.replace("_", " "), 250) for key in PAYMENT_FIELDS}
    if entries["card_link"]:
        url = urlsplit(entries["card_link"])
        host = (url.hostname or "").lower()
        if url.scheme != "https" or url.username or url.password or not (
                host in ("buy.stripe.com", "checkout.stripe.com", "pay.sumup.com", "payment.sumup.com")
                or host.endswith(".sumup.link") or host == "sumup.link"):
            raise ValueError("Enter a hosted Stripe or SumUp payment link.")
    conn.executemany("INSERT INTO invoice_preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                     entries.items())


def annotate(conn, invoice):
    invoice = dict(invoice)
    payments = [dict(row) for row in conn.execute("SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY id", (invoice["id"],))]
    invoice["payments"] = payments
    invoice["paid_pence"] = sum(row["amount_pence"] for row in payments if row["kind"] == "payment")
    invoice["deducted_pence"] = sum(row["amount_pence"] for row in payments if row["kind"] == "deduction")
    invoice["balance_pence"] = max(0, invoice["total_pence"] - invoice["paid_pence"] - invoice["deducted_pence"])
    invoice["paid"] = int(invoice["total_pence"] > 0 and not invoice["balance_pence"])
    return invoice


def record_payment(conn, invoice_id, kind, amount, memo="", external_ref=None):
    row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if not row:
        raise ValueError("Invoice not found.")
    if external_ref and conn.execute("SELECT 1 FROM invoice_payments WHERE external_ref=?", (external_ref,)).fetchone():
        return
    if kind not in ("payment", "deduction"):
        raise ValueError("Choose payment or deduction.")
    invoice = annotate(conn, row)
    if not 0 < amount <= invoice["balance_pence"]:
        raise ValueError("Enter an amount up to the outstanding balance.")
    conn.execute("""INSERT INTO invoice_payments(invoice_id,kind,amount_pence,noted_on,memo,external_ref)
                    VALUES (?,?,?,?,?,?)""", (invoice_id, kind, amount, today().isoformat(), clean(memo, "reference", 250), external_ref))
    conn.execute("UPDATE invoices SET paid=? WHERE id=?", (int(amount == invoice["balance_pence"]), invoice_id))


def import_clients(conn, data):
    if not isinstance(data, list) or not 1 <= len(data) <= 500:
        raise ValueError("Choose a client export with 1–500 records.")
    created = 0
    for row in data:
        if not isinstance(row, dict):
            raise ValueError("Invalid client record.")
        key = clean(row.get("source_key"), "source client reference", 80, True)
        fields = row.get("details", {})
        if not isinstance(fields, dict) or len(fields) > 30:
            raise ValueError("Invalid client contact details.")
        details = {clean(label, "contact label", 80, True): clean(value, "contact details", 2000)
                   for label, value in fields.items() if value}
        billing_email = clean(row.get("email"), "billing email", 254)
        if billing_email and not EMAIL.fullmatch(billing_email):
            raise ValueError("Invalid billing email in the client export.")
        values = (key, clean(row.get("name"), "client name", required=True), billing_email,
                  clean(row.get("address"), "billing address", 1500), json.dumps(details))
        result = conn.execute("""INSERT INTO invoice_clients(source_key,name,email,address,source_details)
            VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO NOTHING""", values)
        created += result.rowcount
    return {"created": created, "already_imported": len(data) - created}


def today():
    return datetime.now(ZoneInfo("Europe/London")).date()


def decimal(value, name, maximum, minimum=0):
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise ValueError(f"Enter a valid {name}.") from None
    if not number.is_finite() or not minimum <= number <= maximum:
        raise ValueError(f"Enter a valid {name}.")
    return number


def rounded(value):
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def pence(value):
    return rounded(decimal(value, "amount", 1000000) * 100)


def clean(value, name, maximum=500, required=False):
    value = str(value or "").strip()
    if len(value) > maximum or (required and not value):
        raise ValueError(f"Enter a valid {name}.")
    return value


def save_client(conn, data):
    name = clean(data.get("name"), "client name", required=True)
    email = clean(data.get("email"), "email address", 254)
    address = clean(data.get("address"), "billing address", 1500)
    if email and not EMAIL.fullmatch(email):
        raise ValueError("Enter a valid email address.")
    if data.get("id"):
        result = conn.execute("UPDATE invoice_clients SET name=?, email=?, address=? WHERE id=?",
                              (name, email, address, data["id"]))
        if not result.rowcount:
            raise ValueError("Client not found.")
        return data["id"]
    return conn.execute("INSERT INTO invoice_clients(name,email,address) VALUES (?,?,?)",
                        (name, email, address)).lastrowid


def save_item(conn, data):
    description = clean(data.get("description"), "item description", required=True)
    unit = pence(data.get("unit_price"))
    if data.get("id"):
        result = conn.execute("UPDATE invoice_items SET description=?, unit_pence=? WHERE id=?",
                              (description, unit, data["id"]))
        if not result.rowcount:
            raise ValueError("Item not found.")
        return data["id"]
    return conn.execute("INSERT INTO invoice_items(description,unit_pence) VALUES (?,?)",
                        (description, unit)).lastrowid


def manual_invoice(conn, data):
    client = conn.execute("SELECT * FROM invoice_clients WHERE id=?", (data.get("client_id"),)).fetchone()
    if not client:
        raise ValueError("Choose a client.")
    if client["archived_at"]:
        saved = conn.execute("SELECT client_id FROM invoices WHERE id=?", (data.get("id"),)).fetchone()
        if not saved or saved["client_id"] != client["id"]:
            raise ValueError("Restore the deleted client before creating a new invoice for them.")
    issued = date.fromisoformat(str(data.get("issued", "")))
    terms = data.get("terms_days")
    if terms not in (None, ""):
        if str(terms) not in ("0", "1", "7", "30"):
            raise ValueError("Choose same day, 1 day, 7 days or 30 days.")
        due = issued + timedelta(days=int(terms))
    else:
        due = date.fromisoformat(str(data.get("due", "")))
    if due < issued:
        raise ValueError("The due date must be on or after the invoice date.")
    raw = data.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 50:
        raise ValueError("Add between 1 and 50 line items.")
    items = []
    for row in raw:
        if not isinstance(row, dict):
            raise ValueError("Invalid line item.")
        qty = decimal(row.get("quantity"), "quantity", 10000, Decimal("0.001"))
        unit = pence(row.get("unit_price"))
        description = clean(row.get("description"), "line description", required=True)
        items.append(dict(description=description, quantity=str(qty), unit_pence=unit,
                          amount_pence=rounded(qty * unit)))
    subtotal = sum(row["amount_pence"] for row in items)
    discount = pence(data.get("discount") or 0)
    if discount > subtotal:
        raise ValueError("The discount cannot exceed the subtotal.")
    rate = decimal(data.get("vat_percent") or 0, "VAT rate", 100)
    vat = rounded(Decimal(subtotal - discount) * rate / 100)
    values = (client["id"], client["name"], client["email"], client["address"], issued.isoformat(), due.isoformat(),
              json.dumps(items), clean(data.get("comments"), "comments", 3000), discount, str(rate), vat, subtotal,
              subtotal - discount + vat)
    if data.get("id"):
        old = conn.execute("SELECT * FROM invoices WHERE id=?", (data["id"],)).fetchone()
        if not old:
            raise ValueError("Invoice not found.")
        ledger = annotate(conn, old)
        if values[-1] < ledger["paid_pence"] + ledger["deducted_pence"]:
            raise ValueError("The invoice total cannot be less than payments and deductions already recorded.")
        result = conn.execute("""UPDATE invoices SET client_id=?, client_name=?, client_email=?, client_address=?,
                    issued=?, due=?, items=?, comments=?, discount_pence=?, vat_percent=?, vat_pence=?, subtotal_pence=?,
                    total_pence=?, delivery='draft', manually_edited=1 WHERE id=? AND delivery IN ('draft','review','failed','queued','sent')""",
                              (*values, data["id"]))
        if not result.rowcount:
            raise ValueError("This invoice is currently being sent.")
        return data["id"]
    return conn.execute("""INSERT INTO invoices(client_id,client_name,client_email,client_address,issued,due,items,
                         comments,discount_pence,vat_percent,vat_pence,subtotal_pence,total_pence)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", values).lastrowid


def from_booking(conn, booking, *, completed=False):
    items = []
    for description, key in (
        (f"{booking['service_type']} · {booking['confirmation_code']} · {booking['pickup_address']} → {booking['dropoff_address']}", "fare_amount"),
        ("Waiting time", "waiting_fee"), ("Extra stops", "extra_stops_fee"),
        ("Parking", "parking_fee"), ("Airport drop-off", "dropoff_fee"), ("Congestion charge", "congestion_charge"),
    ):
        amount = pence(booking.get(key) or 0)
        if amount or key == "fare_amount":
            if key == "fare_amount":
                stops = journey_stops.load(booking.get("stops"))
                if stops:
                    description += " · Stops: " + "; ".join(stops)
            items.append(dict(description=description, quantity="1", unit_pence=amount, amount_pence=amount))
    subtotal = sum(row["amount_pence"] for row in items)
    vat = pence(booking.get("vat_amount") or 0)
    total = subtotal + vat
    published_total = pence(booking.get("total_fare") or 0)
    needs_review = (not total or
                    bool(published_total and published_total != total))
    existing = conn.execute("SELECT * FROM invoices WHERE booking_id=?", (booking["id"],)).fetchone()
    if existing:
        if completed and existing["delivery"] in ("draft", "review", "queued", "failed") and not existing["manually_edited"]:
            current = annotate(conn, existing)
            if total >= current["paid_pence"] + current["deducted_pence"] and not existing["checkout_session"]:
                conn.execute("""UPDATE invoices SET items=?, vat_pence=?, subtotal_pence=?, total_pence=?, delivery=?
                                WHERE id=?""", (json.dumps(items), vat, subtotal, total, "review" if needs_review else "draft", existing["id"]))
        if completed and booking.get("payment_status") == "PAID":
            invoice = annotate(conn, conn.execute("SELECT * FROM invoices WHERE id=?", (existing["id"],)).fetchone())
            captured = pence(booking.get("captured_booking_amount") if booking.get("captured_booking_amount") is not None else booking.get("total_fare") or 0)
            if captured and invoice["paid_pence"] == 0 and captured <= invoice["balance_pence"]:
                record_payment(conn, existing["id"], "payment", captured, "Booking payment captured", "booking:" + booking["id"])
        return existing["id"], False
    email = (booking.get("customer_email") or "").strip()
    client = conn.execute("""SELECT * FROM invoice_clients WHERE lower(email)=lower(?) AND archived_at IS NULL
        ORDER BY CASE WHEN lower(trim(name))='suntory europe limited' AND lower(email) LIKE '%@suntory.com' THEN 0
                      WHEN lower(trim(name))=lower(trim(?)) THEN 1 ELSE 2 END, id LIMIT 1""",
                          (email, booking["customer_name"])).fetchone() if email else None
    if not client:
        client_id = conn.execute("INSERT INTO invoice_clients(name,email) VALUES (?,?)",
                                 (booking["customer_name"], email)).lastrowid
        client = conn.execute("SELECT * FROM invoice_clients WHERE id=?", (client_id,)).fetchone()
    issued = today()
    paid = completed and booking.get("payment_status") == "PAID" and not needs_review
    invoice_id = conn.execute("""INSERT INTO invoices(booking_id,client_id,client_name,client_email,client_address,
         issued,due,items,comments,discount_pence,vat_percent,vat_pence,subtotal_pence,total_pence,delivery,paid)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (booking["id"], client["id"], client["name"], email, client["address"], issued.isoformat(),
         (issued + timedelta(days=7)).isoformat(), json.dumps(items),
         "Final charges require review in Dispatch." if needs_review else "", 0,
         "", vat, subtotal, total, "review" if needs_review else "draft", 0)).lastrowid
    captured = pence(booking.get("captured_booking_amount", booking.get("total_fare")) or 0)
    if paid and 0 < captured <= total:
        record_payment(conn, invoice_id, "payment", captured, "Booking payment captured", "booking:" + booking["id"])
    return invoice_id, False


def number(invoice_id):
    return f"GA-INV-{invoice_id:05d}"


def pounds(amount):
    return f"£{Decimal(amount) / 100:,.2f}"


def bank_lines(settings):
    labels = {"account_name": "Account name", "sort_code": "Sort code", "account_number": "Account number",
              "bic": "BIC", "iban": "IBAN"}
    return [f"{label}: {settings[key]}" for key, label in labels.items() if settings.get(key)]


def markup(invoice, *, printable=False, payment_details=None, card_link=""):
    rows = json.loads(invoice["items"])
    code = number(invoice["id"])
    line_rows = "".join(f"<tr><td>{escape(row['description'])}</td><td>{escape(row['quantity'])}</td>"
                        f"<td>{pounds(row['unit_pence'])}</td><td>{pounds(row['amount_pence'])}</td></tr>" for row in rows)
    discount = f"<tr><td colspan='3'>Discount</td><td>−{pounds(invoice['discount_pence'])}</td></tr>" if invoice["discount_pence"] else ""
    vat_label = f"VAT ({escape(invoice['vat_percent'])}%)" if invoice["vat_percent"] else "VAT"
    vat = f"<tr><td colspan='3'>{vat_label}</td><td>{pounds(invoice['vat_pence'])}</td></tr>" if invoice["vat_pence"] else ""
    if invoice["delivery"] == "review":
        banner = "<p><strong>Draft · final charges pending</strong></p>"
    else:
        banner = "<p><strong>Paid</strong></p>" if invoice["paid"] else ""
    due = "" if invoice["paid"] else f" · Due {escape(invoice['due'])}"
    comments = escape(invoice["comments"]).replace("\n", "<br>")
    print_button = '<button onclick="window.print()">Print or save PDF</button>' if printable else ""
    address = escape(invoice["client_address"]).replace("\n", "<br>")
    payment_details = payment_details or {}
    registration = escape(payment_details.get("vat_number") or os.environ.get("GA_VAT_REGISTRATION", "").strip())
    paid = invoice.get("paid_pence", invoice["total_pence"] if invoice["paid"] else 0)
    deductions = invoice.get("deducted_pence", 0)
    balance = invoice.get("balance_pence", max(0, invoice["total_pence"] - paid - deductions))
    ledger = f'<tr><td colspan="3">Paid</td><td>{pounds(paid)}</td></tr>'
    if deductions:
        ledger += f'<tr><td colspan="3">Deductions</td><td>{pounds(deductions)}</td></tr>'
    ledger += f'<tr style="font-weight:bold"><td colspan="3">Balance due</td><td>{pounds(balance)}</td></tr>'
    bank = bank_lines(payment_details) if balance else []
    bank_section = "<p><strong>Bank transfer</strong><br>" + "<br>".join(escape(line) for line in bank) + "</p>" if bank else ""
    payment_link = f'<p><a href="{escape(card_link, quote=True)}">Pay by card</a></p>' if balance and card_link else ""
    vat_number = f"<br>VAT registration {registration}" if invoice["vat_pence"] and registration else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Invoice {code}</title><style>
@media print {{ button {{display:none}} body {{margin:0}} }}
td,th {{padding:9px 6px;text-align:right;border-bottom:1px solid #e2e7e2}} td:first-child, th:first-child {{text-align:left}}
</style></head><body style="font:15px Arial,sans-serif;color:#18231d;background:#fff">
<main style="max-width:680px;margin:24px auto;padding:0 16px">
<div style="background:#18231d;padding:20px;color:#fff;border-radius:10px">
<img src="https://gachauffeurs.co.uk/assets/ga-logo.png" width="200" alt="GA Chauffeur Services">
<h1 style="font:36px Georgia;margin:15px 0 4px">Invoice</h1><p style="color:#e1c991;margin:0">{code}</p></div>
<p><strong>GA Chauffeur Services Limited</strong><br>1 Glebe Road, Stanmore, HA7 4EJ<br>Company number 11136878{vat_number}<br>enquiries@gachauffeurs.co.uk</p>
<p><strong>Bill to</strong><br>{escape(invoice['client_name'])}<br>{escape(invoice['client_email'])}<br>{address}</p>
<p>Issued {escape(invoice['issued'])}{due}</p>{banner}
<table style="border-collapse:collapse;width:100%" cellspacing="0">
<thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
<tbody>{line_rows}<tr><td colspan="3">Subtotal</td><td>{pounds(invoice['subtotal_pence'])}</td></tr>{discount}{vat}
<tr style="font-weight:bold"><td colspan="3">Total</td><td>{pounds(invoice['total_pence'])}</td></tr>{ledger}</tbody></table>
<p>{comments}</p>{bank_section}{payment_link}{print_button}</main></body></html>"""


def deliver(connection, invoice_id, sender, pdf_builder=None, card_url=None):
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
        if not row or row["delivery"] not in ("draft", "queued", "failed", "sending"):
            return False, "This invoice is already sent or requires review."
        if row["delivery"] == "sending":
            return False, "Delivery is in progress or needs checking."
        if row["booking_id"]:
            booking = conn.execute("SELECT status FROM bookings WHERE id=?", (row["booking_id"],)).fetchone()
            if not booking or booking["status"] != "COMPLETED":
                return False, "Complete the booking and review its final charges before sending."
        invoice = annotate(conn, row)
        settings = preferences(conn)
        if not EMAIL.fullmatch(invoice["client_email"]):
            conn.execute("UPDATE invoices SET delivery='failed' WHERE id=?", (invoice_id,))
            return False, "A valid client email address is required."
        code = number(invoice_id)
        link = settings.get("card_link") or (card_url(invoice) if card_url else "")
        try:
            attachment = (code + ".pdf", pdf_builder(invoice, settings, link)) if pdf_builder else None
            body = markup(invoice, payment_details=settings, card_link=link)
        except Exception:
            return False, "The invoice PDF could not be prepared."
        conn.execute("UPDATE invoices SET delivery='sending' WHERE id=?", (invoice_id,))
    plain = f"Invoice {code} · Balance due {pounds(invoice['balance_pence'])}."
    try:
        if attachment:
            sent, error = sender(invoice["client_email"], f"GA Chauffeurs invoice {code}", body, plain,
                                 pdf_attachment=attachment)
        else:
            sent, error = sender(invoice["client_email"], f"GA Chauffeurs invoice {code}", body, plain)
    except Exception:
        # A transport exception can occur after acceptance. Keep the claim so a retry cannot send twice.
        return False, "Delivery could not be confirmed. Check the mail provider before retrying."
    with connection() as conn:
        conn.execute("UPDATE invoices SET delivery=? WHERE id=?", ("sent" if sent else "failed", invoice_id))
    return sent, "" if sent else "The invoice was saved, but email delivery failed."
