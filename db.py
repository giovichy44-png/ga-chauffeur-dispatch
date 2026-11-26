"""
Database management and models for GA Chauffeur Services Limited.
Website: gachauffeurs.co.uk
Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
"""

import sqlite3
import dispatch_invoices
import dispatch_fleet
import json
import uuid
import os
from datetime import datetime, timedelta

DB_FILE = os.environ.get("DISPATCH_DB_FILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "dispatch.db")

def get_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def assign_missing_call_signs(conn):
    profiles = conn.execute("SELECT id, call_sign FROM chauffeurs ORDER BY id").fetchall()
    used = {profile["call_sign"] for profile in profiles if profile["call_sign"]}
    reserved = {"GA-CHF-01": "GA1", "GA-CHF-02": "GA2", "GA-CHF-03": "GA3"}
    number = 4
    for profile in profiles:
        if profile["call_sign"]:
            continue
        call_sign = reserved.get(profile["id"])
        if not call_sign or call_sign in used:
            while f"GA{number}" in used:
                number += 1
            call_sign = f"GA{number}"
        conn.execute("UPDATE chauffeurs SET call_sign = ? WHERE id = ?", (call_sign, profile["id"]))
        used.add(call_sign)


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Chauffeurs & Vehicles Table (3 Exclusive Vehicles + Verified Chauffeur Credentials)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chauffeurs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        avatar TEXT,
        rating REAL DEFAULT 5.0,
        trips_count INTEGER DEFAULT 0,
        vehicle_model TEXT NOT NULL,
        vehicle_class TEXT NOT NULL,
        license_plate TEXT NOT NULL,
        passenger_capacity INTEGER DEFAULT 4,
        luggage_capacity INTEGER DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        current_zone TEXT NOT NULL,
        active_booking_id TEXT,
        email TEXT DEFAULT '',
        pco_license TEXT DEFAULT '',
        docs_verified INTEGER DEFAULT 1,
        driver_pin TEXT DEFAULT '1234',
        driver_token TEXT DEFAULT ''
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chauffeur_live_locations (
        chauffeur_id TEXT PRIMARY KEY REFERENCES chauffeurs(id) ON DELETE CASCADE,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL NOT NULL,
        updated_at REAL NOT NULL,
        heading REAL
    )
    """)

    if "heading" not in {row["name"] for row in cursor.execute("PRAGMA table_info(chauffeur_live_locations)")}:
        cursor.execute("ALTER TABLE chauffeur_live_locations ADD COLUMN heading REAL")
    if "booking_id" not in {row["name"] for row in cursor.execute("PRAGMA table_info(chauffeur_live_locations)")}:
        cursor.execute("ALTER TABLE chauffeur_live_locations ADD COLUMN booking_id TEXT")


    cursor.execute("PRAGMA table_info(chauffeurs)")
    existing_ch_cols = [row["name"] for row in cursor.fetchall()]
    ch_cols_to_add = [
        ("email", "TEXT DEFAULT ''"),
        ("pco_license", "TEXT DEFAULT ''"),
        ("docs_verified", "INTEGER DEFAULT 1"),
        ("driver_pin", "TEXT DEFAULT '1234'"),
        ("driver_token", "TEXT DEFAULT ''"),
        ("call_sign", "TEXT")
    ]
    for col_name, col_def in ch_cols_to_add:
        if col_name not in existing_ch_cols:
            cursor.execute(f"ALTER TABLE chauffeurs ADD COLUMN {col_name} {col_def}")

    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS chauffeurs_call_sign ON chauffeurs(call_sign)")
    assign_missing_call_signs(conn)

    # Ensure every existing chauffeur has a unique driver_token and driver_pin
    cursor.execute("SELECT id, driver_pin, driver_token, pco_license FROM chauffeurs")
    for ch_row in cursor.fetchall():
        cid = ch_row["id"]
        pin = ch_row["driver_pin"] or ("1001" if cid == "GA-CHF-01" else ("1002" if cid == "GA-CHF-02" else ("1003" if cid == "GA-CHF-03" else "1234")))
        tok = ch_row["driver_token"] or f"drv_{cid.lower().replace('-', '')}_{uuid.uuid4().hex[:10]}"
        pco = ch_row["pco_license"] or ("TFL-PCO-948210" if cid == "GA-CHF-01" else ("TFL-PCO-883419" if cid == "GA-CHF-02" else "TFL-PCO-774102"))
        cursor.execute(
            "UPDATE chauffeurs SET driver_pin = ?, driver_token = ?, pco_license = ?, docs_verified = COALESCE(docs_verified, 1) WHERE id = ?",
            (pin, tok, pco, cid)
        )

    cursor.execute("""
        UPDATE chauffeurs SET license_plate = 'UKZ 454'
        WHERE id = 'GA-CHF-03' AND REPLACE(license_plate, ' ', '') = 'UKZ545'
    """)

    # Live Two-Way Chauffeur <-> Dispatch Messages Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS driver_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chauffeur_id TEXT NOT NULL,
        booking_id TEXT,
        sender_role TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chauffeur_id) REFERENCES chauffeurs(id)
    )
    """)

    # Bookings Table (Currency: GBP £)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        confirmation_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        vip_level TEXT DEFAULT 'Executive',
        service_type TEXT DEFAULT 'Airport Transfer',
        pickup_address TEXT NOT NULL,
        pickup_unit TEXT,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        dropoff_address TEXT NOT NULL,
        dropoff_unit TEXT,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        pickup_datetime TEXT NOT NULL,
        hours_booked INTEGER DEFAULT 0,
        flight_number TEXT,
        flight_status TEXT,
        vehicle_class TEXT NOT NULL,
        passenger_count INTEGER DEFAULT 1,
        luggage_count INTEGER DEFAULT 1,
        large_cases INTEGER DEFAULT 0,
        medium_cases INTEGER DEFAULT 0,
        hand_luggage INTEGER DEFAULT 0,
        special_requests TEXT,
        estimated_distance_mi REAL DEFAULT 15.0,
        estimated_duration_min INTEGER DEFAULT 35,
        fare_amount REAL NOT NULL,
        vat_amount REAL DEFAULT 0.0,
        total_fare REAL NOT NULL,
        currency TEXT DEFAULT 'GBP',
        source TEXT DEFAULT 'DISPATCH_PORTAL',
        status TEXT NOT NULL DEFAULT 'PENDING',
        chauffeur_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (chauffeur_id) REFERENCES chauffeurs(id)
    )
    """)

    # Ensure backwards compatibility with any existing columns
    cursor.execute("PRAGMA table_info(bookings)")
    existing_cols = [row["name"] for row in cursor.fetchall()]
    cols_to_add = [
        ("service_type", "TEXT DEFAULT 'Airport Transfer'"),
        ("pickup_unit", "TEXT"),
        ("dropoff_unit", "TEXT"),
        ("hours_booked", "INTEGER DEFAULT 0"),
        ("large_cases", "INTEGER DEFAULT 0"),
        ("medium_cases", "INTEGER DEFAULT 0"),
        ("hand_luggage", "INTEGER DEFAULT 0"),
        ("vat_amount", "REAL DEFAULT 0.0"),
        ("total_fare", "REAL DEFAULT 0.0"),
        ("parking_fee", "REAL DEFAULT 0.0"),
        ("dropoff_fee", "REAL DEFAULT 0.0"),
        ("congestion_charge", "REAL DEFAULT 0.0"),
        ("payment_status", "TEXT DEFAULT 'PENDING'"),
        ("payment_method", "TEXT DEFAULT 'INVOICE'"),
        ("card_brand", "TEXT"),
        ("card_last4", "TEXT"),
        ("card_auth_code", "TEXT"),
        ("preauth_amount", "REAL DEFAULT 0.0"),
        ("preauth_at", "TEXT"),
        ("stripe_payment_intent_id", "TEXT"),
        ("stripe_customer_id", "TEXT"),
        ("pending_amendment", "TEXT"),
        ("allocation_notice_hours", "INTEGER NOT NULL DEFAULT 2"),
        ("assigned_vehicle_model", "TEXT"),
        ("assigned_vehicle_plate", "TEXT"),
        ("waiting_fee", "REAL NOT NULL DEFAULT 0"),
        ("extra_stops_fee", "REAL NOT NULL DEFAULT 0"),
        ("status_before_delete", "TEXT"),
        ("stops", "TEXT NOT NULL DEFAULT '[]'")
    ]
    for col_name, col_def in cols_to_add:
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE bookings ADD COLUMN {col_name} {col_def}")

    cursor.execute("""
        UPDATE chauffeurs
        SET luggage_capacity = 1
        WHERE LOWER(vehicle_class) LIKE '%s_class%' OR LOWER(vehicle_model) LIKE '%s-class%'
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_chat_messages (
            id INTEGER PRIMARY KEY,
            booking_id TEXT NOT NULL REFERENCES bookings(id),
            sender TEXT NOT NULL CHECK (sender IN ('dispatch', 'customer')),
            message TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            dispatch_read INTEGER NOT NULL DEFAULT 0
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS customer_chat_booking ON customer_chat_messages (booking_id, id)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alert_receipts (
            scope TEXT NOT NULL,
            alert_key TEXT NOT NULL,
            PRIMARY KEY (scope, alert_key)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dispatch_push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            subscription TEXT NOT NULL,
            scope TEXT NOT NULL DEFAULT 'dispatch'
        )
    """)

    if "scope" not in {row["name"] for row in cursor.execute("PRAGMA table_info(dispatch_push_subscriptions)")}:
        cursor.execute("ALTER TABLE dispatch_push_subscriptions ADD COLUMN scope TEXT NOT NULL DEFAULT 'dispatch'")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS confirmations (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DELIVERED',
        sent_at TEXT NOT NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
    """)

    # Action Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS action_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT,
        chauffeur_id TEXT,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL
    )
    """)

    log_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(action_logs)")}
    for name in ("request_ip", "network_trace"):
        if name not in log_columns:
            cursor.execute(f"ALTER TABLE action_logs ADD COLUMN {name} TEXT")

    # System Settings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    dispatch_fleet.init(conn)
    dispatch_invoices.init(conn)
    conn.commit()
    conn.close()

def get_setting(key, default=""):
    try:
        conn = get_connection()
        row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
        conn.close()
        return row["value"] if row and row["value"] else default
    except Exception:
        return default

def set_setting(key, value):
    conn = get_connection()
    conn.execute("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)")
    conn.execute(
        "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, str(value), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    conn.commit()
    conn.close()

def seed_data(force=False):
    conn = get_connection()
    cursor = conn.cursor()

    if force:
        cursor.execute("DROP TABLE IF EXISTS action_logs")
        cursor.execute("DROP TABLE IF EXISTS confirmations")
        cursor.execute("DROP TABLE IF EXISTS bookings")
        cursor.execute("DROP TABLE IF EXISTS chauffeurs")
        conn.commit()
        init_db()

    # The bundled development database contains these exact sample bookings.
    demo_rows = [
        ("BK-5001", "GA-84920"), ("BK-5002", "GA-84921"),
        ("BK-5003", "GA-84922"), ("BK-8595", "GA-F5MTE")
    ]
    for booking_id, reference in demo_rows:
        if cursor.execute("SELECT 1 FROM bookings WHERE id = ? AND confirmation_code = ?", (booking_id, reference)).fetchone():
            cursor.execute("DELETE FROM confirmations WHERE booking_id = ?", (booking_id,))
            cursor.execute("DELETE FROM action_logs WHERE booking_id = ?", (booking_id,))
            cursor.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
            cursor.execute("UPDATE chauffeurs SET status = 'AVAILABLE', active_booking_id = NULL WHERE active_booking_id = ?", (booking_id,))
    conn.commit()

    cursor.execute("SELECT COUNT(*) as count FROM chauffeurs")
    chauffeur_count = cursor.fetchone()["count"]

    if chauffeur_count > 0 and not force:
        conn.close()
        return

    # EXACT 3 VEHICLES AS OPERATED BY GA CHAUFFEUR SERVICES LIMITED
    # 1. Mercedes-Benz S-Class Saloon (Up to 4 Pax, 2 Bags) - HN76GYG
    # 2. Mercedes-Benz V-Class MPV (Up to 6 Pax, 6 Bags) - LR74EOG
    # 3. Range Rover Autobiography Long Wheelbase (Up to 4 Pax, 3 Bags) - UKZ 454
    chauffeurs = [
        (
            "GA-CHF-01", "David Richardson", "+44 7886 622082", "DR", 4.99, 1420,
            "Mercedes-Benz S-Class S580e L AMG Line", "mercedes_s_class", "HN76GYG",
            4, 2, "AVAILABLE", 51.5074, -0.1278, "Central London / Mayfair", None
        ),
        (
            "GA-CHF-02", "Harrison Cole", "+44 7886 622082", "HC", 4.98, 1180,
            "Mercedes-Benz V-Class V300d Extra Long", "mercedes_v_class", "LR74EOG",
            6, 6, "AVAILABLE", 51.4700, -0.4543, "Heathrow Airport (LHR)", None
        ),
        (
            "GA-CHF-03", "Arthur Pendelton", "+44 7886 622082", "AP", 4.99, 1640,
            "Range Rover Autobiography Long Wheelbase (LWB)", "range_rover_autobiography", "UKZ 454",
            4, 3, "AVAILABLE", 51.6150, -0.3080, "Stanmore / North London Base", None
        )
    ]

    cursor.executemany("""
    INSERT INTO chauffeurs (id, name, phone, avatar, rating, trips_count, vehicle_model, vehicle_class, license_plate, passenger_capacity, luggage_capacity, status, lat, lng, current_zone, active_booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, chauffeurs)
    dispatch_fleet.migrate_legacy(conn)
    assign_missing_call_signs(conn)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_data()
    print("GA Chauffeur Services Limited 3-car fleet database initialized successfully.")
