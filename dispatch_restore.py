"""Restore an authenticated Dispatch snapshot without resending notifications."""
from contextlib import closing
import sqlite3
import secrets

import db
import dispatch_invoices

TABLES = ("bookings", "confirmations", "action_logs", "driver_messages", "customer_chat_messages", "alert_receipts", *dispatch_invoices.TABLES)
FLEET_FIELDS = ("id", "name", "phone", "avatar", "rating", "trips_count", "vehicle_model", "vehicle_class",
                "license_plate", "passenger_capacity", "luggage_capacity", "status", "lat", "lng", "current_zone",
                "email", "pco_license", "docs_verified", "call_sign")


def restore(snapshot):
    if not isinstance(snapshot, dict) or any(not isinstance(snapshot.get(table, []), list) for table in TABLES):
        return {"error": "The backup contains an invalid table."}, 400
    if not any(snapshot.get(table) for table in ("bookings", *dispatch_invoices.TABLES)):
        return {"error": "Choose a Dispatch backup containing bookings or invoicing data."}, 400

    with closing(db.get_connection()) as conn, conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        if any(conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone() for table in ("bookings", *dispatch_invoices.TABLES)):
            return {"error": "Restore is available only when Dispatch has no bookings or invoicing data."}, 409

        restored = {}
        try:
            profiles = snapshot.get("fleet_profiles", [])
            if not isinstance(profiles, list):
                raise ValueError("Invalid fleet backup.")
            for record in profiles:
                if not isinstance(record, dict) or not record.get("id") or not record.get("name"):
                    raise ValueError("Invalid fleet profile.")
                columns = [name for name in FLEET_FIELDS if name in record]
                for credential, limit in (("driver_pin", 64), ("driver_token", 256)):
                    if credential in record:
                        value = record[credential]
                        if not isinstance(value, str) or not value or len(value) > limit:
                            raise ValueError("Invalid chauffeur credential in restore snapshot.")
                        columns.append(credential)
                updates = ",".join(f"{name}=excluded.{name}" for name in columns if name != "id")
                placeholders = ",".join("?" for _ in columns)
                values = [record[name] for name in columns]
                if "driver_token" not in columns:
                    columns.append("driver_token")
                    values.append(secrets.token_urlsafe(24))
                    placeholders += ",?"
                conn.execute(f"INSERT INTO chauffeurs ({','.join(columns)}) VALUES ({placeholders}) "
                             f"ON CONFLICT(id) DO UPDATE SET {updates}", values)
            db.assign_missing_call_signs(conn)
            for table in TABLES:
                fields = [row["name"] for row in conn.execute(f"PRAGMA table_info({table})")]
                records = snapshot.get(table, snapshot.get("actions", []) if table == "action_logs" else [])
                if not isinstance(records, list):
                    raise ValueError("Invalid backup records.")
                for record in records:
                    if not isinstance(record, dict):
                        raise ValueError("Invalid backup record.")
                    columns = [field for field in fields if field in record]
                    if not columns:
                        raise ValueError("Backup record has no supported fields.")
                    placeholders = ",".join("?" for _ in columns)
                    conn.execute(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
                                 [record[field] for field in columns])
                restored[table] = len(records)
            for record in snapshot.get("fleet_assignments", []):
                if not isinstance(record, dict) or "id" not in record:
                    raise ValueError("Invalid fleet assignment.")
                booking = conn.execute("SELECT chauffeur_id FROM bookings WHERE id = ?",
                                       (record.get("active_booking_id"),)).fetchone()
                if booking and booking["chauffeur_id"] == record["id"]:
                    conn.execute("UPDATE chauffeurs SET active_booking_id = ?, status = ? WHERE id = ?",
                                 (record["active_booking_id"], record.get("status") or "AVAILABLE", record["id"]))
        except (ValueError, TypeError, sqlite3.DatabaseError):
            conn.rollback()
            return {"error": "Restore stopped because a record did not match Dispatch. No bookings were imported."}, 400
    return {"success": True, "restored": restored}, 200
