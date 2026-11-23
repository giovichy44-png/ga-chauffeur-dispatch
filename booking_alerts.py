"""Persistent, independently acknowledged Dispatch and chauffeur alerts."""
from contextlib import closing
import re

import db

DISPATCH_ACTIONS = ("BOOKING_CREATED", "CUSTOMER_AMENDED_BOOKING", "AMENDMENT_REQUESTED_2H", "CUSTOMER_AMENDMENT_APPROVED", "DISPATCH_AMENDED_BOOKING")
DRIVER_ACTIONS = ("CHAUFFEUR_ALLOCATED", "CUSTOMER_AMENDED_BOOKING", "DISPATCH_AMENDED_BOOKING", "CUSTOMER_AMENDMENT_APPROVED")


def pending(conn, chauffeur_id=None):
    scope = f"driver:{chauffeur_id}" if chauffeur_id else "dispatch"
    actions = DRIVER_ACTIONS if chauffeur_id else DISPATCH_ACTIONS
    placeholders = ",".join("?" for _ in actions)
    where_driver = "AND b.chauffeur_id = ?" if chauffeur_id else ""
    params = (*actions, *((chauffeur_id,) if chauffeur_id else ()), scope)
    bookings = conn.execute(f"""
        WITH latest AS (
            SELECT b.confirmation_code, MAX(a.id) AS alert_id
            FROM action_logs a JOIN bookings b ON a.booking_id = b.id
            WHERE a.action IN ({placeholders}) AND b.status NOT IN ('COMPLETED', 'CANCELLED')
              {where_driver}
            GROUP BY b.id
        )
        SELECT 'booking:' || alert_id AS key, confirmation_code, 'Booking update' AS label, action_logs.details
        FROM latest JOIN action_logs ON action_logs.id = latest.alert_id
        WHERE NOT EXISTS (
            SELECT 1 FROM alert_receipts r WHERE r.scope = ? AND r.alert_key = 'booking:' || latest.alert_id
        )
    """, params).fetchall()
    output = [dict(row) for row in bookings]
    if chauffeur_id:
        messages = conn.execute("""
            SELECT 'message:' || m.id AS key, b.confirmation_code, 'Message from Dispatch' AS label
            FROM driver_messages m LEFT JOIN bookings b ON b.id = m.booking_id
            WHERE m.chauffeur_id = ? AND m.sender_role = 'DISPATCH'
              AND NOT EXISTS (
                  SELECT 1 FROM alert_receipts r WHERE r.scope = ? AND r.alert_key = 'message:' || m.id
              )
        """, (chauffeur_id, scope)).fetchall()
        output.extend(dict(row) for row in messages)
    return output


def acknowledge(keys, *, token=None):
    if not isinstance(keys, list) or len(keys) > 500 or any(
        not isinstance(key, str) or re.fullmatch(r"(booking|message):[0-9]{1,18}", key) is None
        for key in keys
    ):
        return {"error": "Invalid alert selection."}, 400
    with closing(db.get_connection()) as conn, conn:
        chauffeur_id = None
        if token is not None:
            if not token:
                return {"error": "Driver sign-in required."}, 401
            chauffeur = conn.execute("SELECT id FROM chauffeurs WHERE driver_token = ?", (token,)).fetchone()
            if not chauffeur:
                return {"error": "Driver sign-in required."}, 401
            chauffeur_id = chauffeur["id"]
        scope = f"driver:{chauffeur_id}" if chauffeur_id else "dispatch"
        allowed = {alert["key"] for alert in pending(conn, chauffeur_id)}
        conn.executemany("INSERT OR IGNORE INTO alert_receipts (scope, alert_key) VALUES (?, ?)",
                         ((scope, key) for key in keys if key in allowed))
    return {"success": True}, 200


def describe_changes(previous, changes):
    labels = {
        "customer_name": "customer name", "customer_phone": "contact phone", "customer_email": "contact email",
        "pickup_datetime": "pickup time", "pickup_address": "pickup address",
        "dropoff_address": "destination", "flight_number": "flight number",
        "vehicle_class": "vehicle", "passenger_count": "passenger count",
        "large_cases": "luggage", "medium_cases": "luggage", "hand_luggage": "luggage",
        "special_requests": "special requests", "total_fare": "fare",
    }
    modified = dict.fromkeys(labels[key] for key, value in changes.items()
                             if key in labels and (previous.get(key) or "") != (value or ""))
    return "Updated " + ", ".join(modified) + "." if modified else "Booking details saved."
