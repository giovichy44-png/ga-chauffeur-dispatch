"""Persistent, independently acknowledged Dispatch and chauffeur alerts."""
from contextlib import closing
from datetime import datetime
from zoneinfo import ZoneInfo
import re

import db

DISPATCH_ACTIONS = ("BOOKING_CREATED", "ALLOCATION_DUE", "CHAUFFEUR_LATE", "CUSTOMER_AMENDED_BOOKING", "AMENDMENT_REQUESTED_2H", "CUSTOMER_AMENDMENT_APPROVED", "DISPATCH_AMENDED_BOOKING")
DRIVER_ACTIONS = ("CHAUFFEUR_ALLOCATED", "CHAUFFEUR_REMOVED", "CUSTOMER_AMENDED_BOOKING", "DISPATCH_AMENDED_BOOKING", "CUSTOMER_AMENDMENT_APPROVED", "AMENDMENT_REQUESTED_2H")


def pending(conn, chauffeur_id=None):
    scope = f"driver:{chauffeur_id}" if chauffeur_id else "dispatch"
    actions = DRIVER_ACTIONS if chauffeur_id else DISPATCH_ACTIONS
    placeholders = ",".join("?" for _ in actions)
    where_driver = """AND ((a.action = 'CHAUFFEUR_REMOVED' AND a.chauffeur_id = ?)
        OR (a.action <> 'CHAUFFEUR_REMOVED' AND b.chauffeur_id = ? AND a.chauffeur_id = ?))""" if chauffeur_id else ""
    params = (*actions, *((chauffeur_id,) * 3 if chauffeur_id else ()), scope)
    bookings = conn.execute(f"""
        WITH latest AS (
            SELECT b.confirmation_code, MAX(a.id) AS alert_id
            FROM action_logs a JOIN bookings b ON a.booking_id = b.id
            WHERE a.action IN ({placeholders}) AND b.status NOT IN ('COMPLETED', 'CANCELLED')
              AND (a.action <> 'ALLOCATION_DUE' OR
                (b.chauffeur_id IS NULL AND instr(a.details,b.pickup_datetime)>0))
              AND (a.action <> 'CHAUFFEUR_LATE' OR
                (a.chauffeur_id=b.chauffeur_id AND instr(a.details,b.pickup_datetime)>0
                 AND b.status IN ('PENDING','CONFIRMED','ASSIGNED','ACCEPTED','EN_ROUTE')))
              {where_driver}
            GROUP BY b.id
        )
        SELECT 'booking:' || alert_id AS key, action_logs.booking_id, confirmation_code, 'Booking update' AS label, action_logs.action, action_logs.details
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
    output.sort(key=lambda alert: int(alert["key"].split(":")[1]), reverse=True)
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
        "dropoff_address": "destination", "stops": "stops", "flight_number": "flight number",
        "vehicle_class": "vehicle", "passenger_count": "passenger count",
        "large_cases": "luggage", "medium_cases": "luggage", "hand_luggage": "luggage",
        "special_requests": "special requests", "total_fare": "fare",
    }
    modified = dict.fromkeys(labels[key] for key, value in changes.items()
                             if key in labels and (previous.get(key) or "") != (value or ""))
    return "Updated " + ", ".join(modified) + "." if modified else "Booking details saved."


def pickup_alerts(now, eta_minutes):
    """Report a reminder once per pickup time and time window, using only recent real GPS for ETA."""
    candidates = []
    with closing(db.get_connection()) as conn:
        for row in conn.execute("""
            SELECT b.id,b.confirmation_code,b.pickup_datetime,b.allocation_notice_hours,b.chauffeur_id,
                   b.status,b.pickup_lat,b.pickup_lng,l.latitude,l.longitude,l.updated_at AS gps_at,
                   EXISTS(SELECT 1 FROM action_logs a WHERE a.booking_id=b.id AND a.chauffeur_id=b.chauffeur_id
                          AND a.action='CHAUFFEUR_LATE' AND instr(a.details,b.pickup_datetime)>0) AS already_late
            FROM bookings b LEFT JOIN chauffeur_live_locations l ON l.chauffeur_id=b.chauffeur_id
            WHERE b.status IN ('PENDING','CONFIRMED','ASSIGNED','ACCEPTED','EN_ROUTE')
        """).fetchall():
            try:
                pickup = datetime.fromisoformat(row["pickup_datetime"])
                if pickup.tzinfo is None:
                    pickup = pickup.replace(tzinfo=ZoneInfo("Europe/London"))
            except (TypeError, ValueError):
                continue
            minutes = (pickup.timestamp() - now.timestamp()) / 60
            if not row["chauffeur_id"]:
                hours = row["allocation_notice_hours"]
                if -120 < minutes <= hours * 60:
                    candidates.append((row, "ALLOCATION_DUE", f"Still unallocated · pickup {row['pickup_datetime']} · {hours}-hour reminder"))
            elif row["status"] == "EN_ROUTE" and not row["already_late"] and -120 < minutes <= 120:
                if minutes <= 0:
                    candidates.append((row, "CHAUFFEUR_LATE", f"Pickup time passed without an arrival update · {row['pickup_datetime']}"))
                elif row["gps_at"] is not None and now.timestamp() - row["gps_at"] < 60:
                    eta = eta_minutes(dict(row))
                    if eta is not None and eta > minutes + 2:
                        candidates.append((row, "CHAUFFEUR_LATE", f"Live ETA exceeds pickup time · {row['pickup_datetime']}"))
            elif row["chauffeur_id"] and -120 < minutes <= 0:
                candidates.append((row, "CHAUFFEUR_LATE", f"Pickup time passed without an arrival update · {row['pickup_datetime']}"))
    alerts = []
    with closing(db.get_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        for row, action, text in candidates:
            current = conn.execute("SELECT status,chauffeur_id,pickup_datetime,allocation_notice_hours FROM bookings WHERE id=?",
                                   (row["id"],)).fetchone()
            if not current or any(current[field] != row[field] for field in current.keys()):
                continue
            if conn.execute("""SELECT 1 FROM action_logs WHERE booking_id=? AND action=? AND details LIKE ?
                AND COALESCE(chauffeur_id,'')=COALESCE(?,'')""",
                (row["id"], action, f"%{row['pickup_datetime']}%", row["chauffeur_id"])).fetchone():
                continue
            conn.execute("""INSERT INTO action_logs(booking_id,chauffeur_id,action,actor,details,timestamp)
                            VALUES (?,?,?,'Dispatch alerts',?,?)""",
                         (row["id"], row["chauffeur_id"], action, text, now.isoformat()))
            alerts.append((row["confirmation_code"], text))
    return alerts
