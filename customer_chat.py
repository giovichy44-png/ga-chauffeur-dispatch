"""Booking-linked customer chat, available during London dispatch hours."""
import hashlib
import hmac
import os
import secrets
from contextlib import closing
from datetime import datetime
from zoneinfo import ZoneInfo

import db

LONDON = ZoneInfo("Europe/London")
SESSION_KEY = secrets.token_bytes(32)
CLOSED_STATUSES = ("COMPLETED", "CANCELLED")


def access_token(reference, email):
    key = os.environ.get("CUSTOMER_CHAT_SIGNING_KEY") or os.environ.get("QUOTE_SIGNING_SECRET")
    secret = key.encode() if key else SESSION_KEY
    identity = f"customer-chat\n{reference}\n{email.strip().lower()}"
    return hmac.new(secret, identity.encode(), hashlib.sha256).hexdigest()


def within_hours(now=None):
    now = (now or datetime.now(LONDON)).astimezone(LONDON)
    return now.weekday() < 5 and 8 <= now.hour < 19


def unread_count():
    with closing(db.get_connection()) as conn, conn:
        return conn.execute("""
            SELECT COUNT(*) FROM customer_chat_messages AS m
            JOIN bookings AS b ON b.id = m.booking_id
            WHERE m.sender = 'customer' AND m.dispatch_read = 0
              AND b.status NOT IN ('COMPLETED', 'CANCELLED')
        """).fetchone()[0]


def handle(payload, *, dispatch=False):
    action = payload.get("action", "read")
    if action not in (("read", "send", "inbox", "download") if dispatch else ("read", "send")):
        return {"error": "Unknown chat action."}, 400

    with closing(db.get_connection()) as conn, conn:
        if action == "inbox":
            threads = conn.execute("""
                SELECT b.confirmation_code, b.customer_name, b.status,
                       MAX(m.id) AS latest,
                       SUM(CASE WHEN m.sender = 'customer' AND m.dispatch_read = 0
                                AND b.status NOT IN ('COMPLETED', 'CANCELLED') THEN 1 ELSE 0 END) AS unread
                FROM customer_chat_messages AS m JOIN bookings AS b ON b.id = m.booking_id
                GROUP BY b.id ORDER BY latest DESC
            """)
            return {"threads": [dict(row) for row in threads], "within_hours": within_hours()}, 200

        if action == "send":
            conn.execute("BEGIN IMMEDIATE")
        reference = str(payload.get("code", "")).strip().upper()
        booking = conn.execute("""
            SELECT id, confirmation_code, customer_email, status FROM bookings
            WHERE confirmation_code = ?
        """, (reference,)).fetchone()
        if not dispatch:
            token = str(payload.get("token", ""))
            if not booking or not token.isascii() or not hmac.compare_digest(
                token, access_token(reference, booking["customer_email"] or "")
            ):
                return {"error": "Open chat from your booking confirmation link."}, 403
        elif not booking:
            return {"error": "Booking not found."}, 404

        closed = booking["status"] in CLOSED_STATUSES
        open_now = within_hours()
        if action == "send":
            if closed:
                return {"error": "This booking’s chat is closed."}, 409
            if not open_now:
                return {"error": "Chat is available Monday to Friday, 08:00–19:00 UK time."}, 409
            message = str(payload.get("message") or "").strip()
            if not 1 <= len(message) <= 1000:
                return {"error": "Enter a message of 1–1,000 characters."}, 400
            conn.execute("""
                INSERT INTO customer_chat_messages (booking_id, sender, message, sent_at)
                VALUES (?, ?, ?, ?)
            """, (booking["id"], "dispatch" if dispatch else "customer", message,
                  datetime.now(LONDON).isoformat(timespec="seconds")))

        if closed and not dispatch:
            return {"closed": True, "within_hours": open_now, "messages": []}, 200
        if dispatch and action == "read" and not closed:
            conn.execute("""
                UPDATE customer_chat_messages SET dispatch_read = 1
                WHERE booking_id = ? AND sender = 'customer' AND dispatch_read = 0
            """, (booking["id"],))
        messages = conn.execute("""
            SELECT sender, message, sent_at FROM customer_chat_messages
            WHERE booking_id = ? ORDER BY id
        """, (booking["id"],))
        return {"code": reference, "closed": closed, "within_hours": open_now,
                "messages": [dict(row) for row in messages]}, 200
