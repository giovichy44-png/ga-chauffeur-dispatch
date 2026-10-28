"""
Database management and models for GA Chauffeur Services Limited.
Website: gachauffeurs.co.uk
Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime, timedelta

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dispatch.db")

def get_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Chauffeurs & Vehicles Table (3 Exclusive Vehicles)
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
        active_booking_id TEXT
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
        pickup_address TEXT NOT NULL,
        pickup_lat REAL NOT NULL,
        pickup_lng REAL NOT NULL,
        dropoff_address TEXT NOT NULL,
        dropoff_lat REAL NOT NULL,
        dropoff_lng REAL NOT NULL,
        pickup_datetime TEXT NOT NULL,
        flight_number TEXT,
        flight_status TEXT,
        vehicle_class TEXT NOT NULL,
        passenger_count INTEGER DEFAULT 1,
        luggage_count INTEGER DEFAULT 1,
        special_requests TEXT,
        estimated_distance_mi REAL DEFAULT 15.0,
        estimated_duration_min INTEGER DEFAULT 35,
        fare_amount REAL NOT NULL,
        currency TEXT DEFAULT 'GBP',
        source TEXT DEFAULT 'DISPATCH_PORTAL',
        status TEXT NOT NULL DEFAULT 'PENDING',
        chauffeur_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (chauffeur_id) REFERENCES chauffeurs(id)
    )
    """)

    # Confirmations Table
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

    cursor.execute("SELECT COUNT(*) as count FROM chauffeurs")
    chauffeur_count = cursor.fetchone()["count"]

    if chauffeur_count > 0 and not force:
        conn.close()
        return

    # EXACT 3 VEHICLES AS OPERATED BY GA CHAUFFEUR SERVICES LIMITED
    # 1. Mercedes-Benz S-Class Saloon (Up to 4 Pax, 2 Bags)
    # 2. Mercedes-Benz V-Class MPV (Up to 7 Pax, 6 Bags)
    # 3. Range Rover Autobiography Long Wheelbase (Up to 4 Pax, 3 Bags)
    chauffeurs = [
        (
            "GA-CHF-01", "David Richardson", "+44 7886 622082", "DR", 4.99, 1420,
            "Mercedes-Benz S-Class S580e L AMG Line", "mercedes_s_class", "GA24 LUX",
            4, 2, "AVAILABLE", 51.5074, -0.1278, "Central London / Mayfair", None
        ),
        (
            "GA-CHF-02", "Harrison Cole", "+44 7886 622082", "HC", 4.98, 1180,
            "Mercedes-Benz V-Class V300d Extra Long", "mercedes_v_class", "GA24 VAN",
            7, 6, "AVAILABLE", 51.4700, -0.4543, "Heathrow Airport (LHR)", None
        ),
        (
            "GA-CHF-03", "Arthur Pendelton", "+44 7886 622082", "AP", 4.99, 1640,
            "Range Rover Autobiography Long Wheelbase (LWB)", "range_rover_autobiography", "GA24 RVR",
            4, 3, "AVAILABLE", 51.6150, -0.3080, "Stanmore / North London Base", None
        )
    ]

    cursor.executemany("""
    INSERT INTO chauffeurs (id, name, phone, avatar, rating, trips_count, vehicle_model, vehicle_class, license_plate, passenger_capacity, luggage_capacity, status, lat, lng, current_zone, active_booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, chauffeurs)

    # Initial Bookings for GA Chauffeur Services Limited
    now = datetime.now()
    t_plus_45m = (now + timedelta(minutes=45)).strftime("%Y-%m-%d %H:%M")
    t_plus_2h = (now + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")
    t_plus_4h = (now + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M")

    bookings = [
        (
            "BK-5001", "GA-84920", "Lord Henry Cavendish", "+44 7700 900891", "h.cavendish@foreignoffice.gov.uk", "VIP / Diplomatic",
            "Heathrow Airport (LHR) Terminal 5, Windsor Suite", 51.4700, -0.4543,
            "The Connaught, Carlos Place, Mayfair, London W1K 2AL", 51.5100, -0.1492,
            t_plus_45m, "BA 178", "Landed - On Time", "mercedes_s_class",
            2, 2, "VIP Meet & Greet with nameboard at jetbridge, chilled Hildon sparkling water, phone charger ready",
            17.2, 42, 175.00, "GBP", "WEBSITE_GACHAUFFEURS", "CONFIRMED", None,
            now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")
        ),
        (
            "BK-5002", "GA-84921", "Victoria Kensington", "+44 7700 900904", "victoria@vanguardglobal.co.uk", "Executive",
            "Canary Wharf, One Canada Square, London E14 5AA", 51.5048, -0.0195,
            "Farnborough Airport (FAB), Signature Aviation Private FBO", 51.2758, -0.7763,
            t_plus_2h, "G-OEDG (Challenger 350)", "Ready for Departure", "range_rover_autobiography",
            3, 3, "Luggage assist for 3 Rimowa suitcases, privacy glass, Wi-Fi",
            44.6, 68, 295.00, "GBP", "WEBSITE_GACHAUFFEURS", "PENDING", None,
            now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")
        ),
        (
            "BK-5003", "GA-84922", "Sir Alistair Finch & Party", "+44 7700 900612", "afinch@finchpartners.co.uk", "Corporate Standard",
            "The Savoy, Strand, London WC2R 0EZ", 51.5103, -0.1207,
            "Wimbledon All England Club, Church Road, London SW19 5AE", 51.4344, -0.2144,
            t_plus_4h, None, None, "mercedes_v_class",
            6, 5, "Party of 6 with luggage, mineral water, umbrellas ready",
            8.4, 30, 195.00, "GBP", "DISPATCH_PORTAL", "PENDING", None,
            now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d %H:%M:%S")
        )
    ]

    cursor.executemany("""
    INSERT INTO bookings (id, confirmation_code, customer_name, customer_phone, customer_email, vip_level,
                          pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                          pickup_datetime, flight_number, flight_status, vehicle_class, passenger_count,
                          luggage_count, special_requests, estimated_distance_mi, estimated_duration_min,
                          fare_amount, currency, source, status, chauffeur_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, bookings)

    # Initial Confirmation Log
    cursor.execute("""
    INSERT INTO confirmations (id, booking_id, channel, recipient, subject, content, status, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "CNF-9001", "BK-5001", "EMAIL", "h.cavendish@foreignoffice.gov.uk",
        "Booking Confirmation: GA-84920 - GA Chauffeur Services Limited",
        "Dear Lord Henry Cavendish,\n\nThank you for choosing GA Chauffeur Services Limited (gachauffeurs.co.uk). Your private luxury transfer is confirmed.\n\nBooking Reference: GA-84920\nPickup: Heathrow Airport (LHR) Terminal 5 at " + t_plus_45m + "\nDestination: The Connaught, Mayfair, London\nVehicle: Mercedes-Benz S-Class Saloon\nFlight Monitoring: BA 178 (Landed - On Time)\nAll-Inclusive Fare: £175.00 GBP\n\nYour executive chauffeur will be assigned shortly. You will receive driver contact details and real-time live tracking.\n\nGA Chauffeur Services Limited\n1 Glebe Road, Stanmore, Greater London, HA7 4EJ\nWebsite: https://gachauffeurs.co.uk\nPhone: +44 7886 622082\nEmail: enquiries@gachauffeurs.co.uk",
        "DELIVERED",
        now.strftime("%Y-%m-%d %H:%M:%S")
    ))

    cursor.execute("""
    INSERT INTO action_logs (booking_id, chauffeur_id, action, actor, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        "BK-5001", None, "BOOKING_CREATED", "Website Booking Engine (gachauffeurs.co.uk)",
        "Booking request GA-84920 received from gachauffeurs.co.uk for Lord Henry Cavendish. Confirmation email & SMS dispatched.",
        now.strftime("%Y-%m-%d %H:%M:%S")
    ))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_data(force=True)
    print("GA Chauffeur Services Limited 3-car fleet database initialized successfully.")
