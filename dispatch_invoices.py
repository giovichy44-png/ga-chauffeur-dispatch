"""Dispatch invoice ledger. Money is stored in integer GBP pence."""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import escape
import json
import os
import re
from zoneinfo import ZoneInfo

TABLES = ("invoice_clients", "invoice_items", "invoices")
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
        result = conn.execute("""UPDATE invoices SET client_id=?, client_name=?, client_email=?, client_address=?,
                    issued=?, due=?, items=?, comments=?, discount_pence=?, vat_percent=?, vat_pence=?, subtotal_pence=?,
                    total_pence=?, delivery='draft' WHERE id=? AND delivery IN ('draft','review','failed') AND paid=0""",
                              (*values, data["id"]))
        if not result.rowcount:
            raise ValueError("Only unsent invoices can be edited.")
        return data["id"]
    return conn.execute("""INSERT INTO invoices(client_id,client_name,client_email,client_address,issued,due,items,
                         comments,discount_pence,vat_percent,vat_pence,subtotal_pence,total_pence)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", values).lastrowid


def from_booking(conn, booking):
    existing = conn.execute("SELECT id, delivery FROM invoices WHERE booking_id=?", (booking["id"],)).fetchone()
    if existing:
        return existing["id"], False
    email = (booking.get("customer_email") or "").strip()
    client = conn.execute("SELECT * FROM invoice_clients WHERE lower(email)=lower(?) ORDER BY id LIMIT 1",
                          (email,)).fetchone() if email else None
    if not client:
        client_id = conn.execute("INSERT INTO invoice_clients(name,email) VALUES (?,?)",
                                 (booking["customer_name"], email)).lastrowid
        client = conn.execute("SELECT * FROM invoice_clients WHERE id=?", (client_id,)).fetchone()
    items = []
    for description, key in (
        (f"{booking['service_type']} · {booking['confirmation_code']} · {booking['pickup_address']} → {booking['dropoff_address']}", "fare_amount"),
        ("Parking", "parking_fee"), ("Airport drop-off", "dropoff_fee"), ("Congestion charge", "congestion_charge"),
    ):
        amount = pence(booking.get(key) or 0)
        if amount or key == "fare_amount":
            items.append(dict(description=description, quantity="1", unit_pence=amount, amount_pence=amount))
    subtotal = sum(row["amount_pence"] for row in items)
    vat = pence(booking.get("vat_amount") or 0)
    total = subtotal + vat
    published_total = pence(booking.get("total_fare") or 0)
    needs_review = (booking.get("service_type") == "Open hours chauffeur service" or not total or
                    bool(published_total and published_total != total))
    issued = today()
    paid = booking.get("payment_status") == "PAID" and not needs_review
    invoice_id = conn.execute("""INSERT INTO invoices(booking_id,client_id,client_name,client_email,client_address,
         issued,due,items,comments,discount_pence,vat_percent,vat_pence,subtotal_pence,total_pence,delivery,paid)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (booking["id"], client["id"], client["name"], email, client["address"], issued.isoformat(),
         (issued + timedelta(days=14)).isoformat(), json.dumps(items),
         "Final charges require review in Dispatch." if needs_review else "", 0,
         "", vat, subtotal, total, "review" if needs_review else "queued", paid)).lastrowid
    return invoice_id, not needs_review


def number(invoice_id):
    return f"GA-INV-{invoice_id:05d}"


def pounds(amount):
    return f"£{Decimal(amount) / 100:,.2f}"


def markup(invoice, *, printable=False):
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
    registration = escape(os.environ.get("GA_VAT_REGISTRATION", "").strip())
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
<tr style="font-weight:bold"><td colspan="3">Total</td><td>{pounds(invoice['total_pence'])}</td></tr></tbody></table>
<p>{comments}</p>{print_button}</main></body></html>"""


def deliver(connection, invoice_id, sender):
    with connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
        if not row or row["delivery"] not in ("draft", "queued", "failed", "sending"):
            return False, "This invoice is already sent or requires review."
        if row["delivery"] == "sending":
            return False, "Delivery is in progress or needs checking."
        invoice = dict(row)
        if not EMAIL.fullmatch(invoice["client_email"]):
            conn.execute("UPDATE invoices SET delivery='failed' WHERE id=?", (invoice_id,))
            return False, "A valid client email address is required."
        conn.execute("UPDATE invoices SET delivery='sending' WHERE id=?", (invoice_id,))
    code = number(invoice_id)
    try:
        sent, error = sender(invoice["client_email"], f"GA Chauffeurs invoice {code}", markup(invoice),
                             f"Invoice {code} · {pounds(invoice['total_pence'])}. See the email for the full breakdown.")
    except Exception:
        # A transport exception can occur after acceptance. Keep the claim so a retry cannot send twice.
        return False, "Delivery could not be confirmed. Check the mail provider before retrying."
    with connection() as conn:
        conn.execute("UPDATE invoices SET delivery=? WHERE id=?", ("sent" if sent else "failed", invoice_id))
    return sent, "" if sent else "The invoice was saved, but email delivery failed."
