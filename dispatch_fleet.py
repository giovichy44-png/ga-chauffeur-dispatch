"""Vehicle registry and current chauffeur assignments."""
import re


def registration_key(value):
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def init(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS fleet_vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, registration_key TEXT NOT NULL UNIQUE,
        license_plate TEXT NOT NULL, vehicle_model TEXT NOT NULL, vehicle_class TEXT NOT NULL,
        passenger_capacity INTEGER NOT NULL, luggage_capacity INTEGER NOT NULL
    )""")
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(chauffeurs)")}
    if "fleet_vehicle_id" not in columns:
        conn.execute("ALTER TABLE chauffeurs ADD COLUMN fleet_vehicle_id INTEGER REFERENCES fleet_vehicles(id)")
        migrate_legacy(conn)


def migrate_legacy(conn):
    for profile in conn.execute("SELECT * FROM chauffeurs WHERE trim(COALESCE(license_plate,''))<>'' ORDER BY id").fetchall():
        key = registration_key(profile["license_plate"])
        if not key:
            continue
        conn.execute("""INSERT OR IGNORE INTO fleet_vehicles
            (registration_key,license_plate,vehicle_model,vehicle_class,passenger_capacity,luggage_capacity)
            VALUES (?,?,?,?,?,?)""", (key, profile["license_plate"], profile["vehicle_model"],
                profile["vehicle_class"], profile["passenger_capacity"] or 0, profile["luggage_capacity"] or 0))
        conn.execute("""UPDATE chauffeurs SET fleet_vehicle_id=(SELECT id FROM fleet_vehicles WHERE registration_key=?)
                        WHERE id=? AND fleet_vehicle_id IS NULL""", (key, profile["id"]))


def profile_vehicle(conn, chauffeur):
    return conn.execute("SELECT * FROM fleet_vehicles WHERE id=?", (chauffeur["fleet_vehicle_id"],)).fetchone()


def save_vehicle(conn, data, normalize):
    model = str(data.get("vehicle_model") or "").strip()
    plate = str(data.get("license_plate") or "").strip().upper()
    key = registration_key(plate)
    tier = normalize(data.get("vehicle_class"))
    model_tier = normalize(model)
    if not model or len(model) > 120 or not 2 <= len(key) <= 15 or len(plate)>20 or not tier or model_tier not in (None, tier):
        raise ValueError("Enter a registration and a model in the matching vehicle class.")
    capacity = int(data.get("passenger_capacity") or 0)
    luggage = int(data.get("luggage_capacity") or 0)
    if not 1 <= capacity <= 20 or not 0 <= luggage <= 50:
        raise ValueError("Enter valid passenger and luggage capacities.")
    values = (key, plate, model, tier, capacity, luggage)
    if data.get("id"):
        result = conn.execute("""UPDATE fleet_vehicles SET registration_key=?, license_plate=?, vehicle_model=?,
            vehicle_class=?, passenger_capacity=?, luggage_capacity=? WHERE id=?""", (*values, data["id"]))
        if not result.rowcount:
            raise ValueError("Vehicle not found.")
        return data["id"]
    return conn.execute("""INSERT INTO fleet_vehicles(registration_key,license_plate,vehicle_model,vehicle_class,
        passenger_capacity,luggage_capacity) VALUES (?,?,?,?,?,?)""", values).lastrowid
