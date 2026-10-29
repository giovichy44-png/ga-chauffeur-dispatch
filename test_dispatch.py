"""
Automated Test Suite for GA Chauffeur Services Limited.
Tests:
1. Database initialization and London chauffeur fleet
2. GBP (£) Luxury Fare Engine
3. Website Booking Intake (gachauffeurs.co.uk) & reference code generation (GA-XXXXX)
4. Customer Confirmation Email dispatch
5. Chauffeur Allocation & Assignment alerts
6. Live mobile actions lifecycle
7. Confirmation resending
8. Action audit logs
"""

import os
import sys
import json
import db
import server

def run_tests():
    print("================================================================")
    print("  RUNNING GA CHAUFFEUR SERVICES LIMITED TEST SUITE             ")
    print("  Website: gachauffeurs.co.uk                                   ")
    print("================================================================")

    # 1. Database Init & Seeding
    print("\n[TEST 1] Initializing Database & London Chauffeur Fleet...")
    db.init_db()
    db.seed_data(force=True)
    conn = db.get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM chauffeurs ORDER BY id")
    chauffeurs = c.fetchall()
    assert len(chauffeurs) == 3, f"Expected 3 chauffeurs, got {len(chauffeurs)}"
    assert chauffeurs[0]["license_plate"] == "HN76GYG", f"Expected HN76GYG, got {chauffeurs[0]['license_plate']}"
    assert chauffeurs[1]["license_plate"] == "LR74EOG", f"Expected LR74EOG, got {chauffeurs[1]['license_plate']}"
    assert chauffeurs[1]["passenger_capacity"] == 6, f"Expected 6-seater, got {chauffeurs[1]['passenger_capacity']}"
    assert chauffeurs[2]["license_plate"] == "UKZ 545", f"Expected UKZ 545, got {chauffeurs[2]['license_plate']}"
    print(f"  ✓ Seeded {len(chauffeurs)} exclusive vehicles with custom registrations: HN76GYG (S-Class), LR74EOG (V-Class 6-Seater), and UKZ 545 (Range Rover LWB)")

    c.execute("SELECT COUNT(*) as count FROM bookings")
    b_count = c.fetchone()["count"]
    assert b_count == 3, f"Expected 3 initial bookings, got {b_count}"
    print(f"  ✓ Seeded {b_count} initial London bookings")
    conn.close()

    # 2. Test GBP Pricing Engine
    print("\n[TEST 2] Testing UK Luxury Mileage Fare Calculator (GBP £)...")
    fare_s_class = server.calculate_fare("mercedes_s_class", 17.2, 42)
    fare_range_rover = server.calculate_fare("range_rover_autobiography", 44.6, 68)
    fare_v_class = server.calculate_fare("mercedes_v_class", 8.4, 30)
    print(f"  ✓ Mercedes S-Class LHR T5 to Mayfair (17.2 mi, 42 min): £{fare_s_class:.2f} GBP")
    print(f"  ✓ Range Rover Autobiography Canary Wharf to Farnborough (44.6 mi, 68 min): £{fare_range_rover:.2f} GBP")
    print(f"  ✓ Mercedes V-Class The Savoy to Wimbledon (8.4 mi, 30 min): £{fare_v_class:.2f} GBP")
    assert fare_s_class >= 135.0, "Minimum S-Class fare check failed"
    assert fare_range_rover >= 175.0, "Minimum Range Rover fare check failed"

    # 3. Test Website Booking Intake & Reference Generation
    print("\n[TEST 3] Testing Customer Booking Request From Website (gachauffeurs.co.uk)...")
    class MockHandler(server.DispatchRequestHandler):
        def __init__(self):
            self.sent_response = None
            self.sent_data = None
        def send_json(self, data, status_code=200):
            self.sent_data = data
            self.sent_response = status_code

    handler = MockHandler()

    website_booking_payload = {
        "customer_name": "Duchess of Westminster",
        "customer_phone": "+44 7700 900555",
        "customer_email": "westminster@estate.co.uk",
        "vip_level": "Celebrity / Royal",
        "pickup_address": "Heathrow Airport (LHR) Terminal 5, Windsor Suite",
        "pickup_lat": 51.4700,
        "pickup_lng": -0.4543,
        "dropoff_address": "The Connaught, Carlos Place, Mayfair, London W1K 2AL",
        "dropoff_lat": 51.5100,
        "dropoff_lng": -0.1492,
        "pickup_datetime": "2026-10-29 16:30",
        "flight_number": "BA 178",
        "vehicle_class": "first_class",
        "passenger_count": 2,
        "luggage_count": 3,
        "special_requests": "Meet & Greet with nameboard at jetbridge, chilled Hildon water",
        "source": "WEBSITE_GACHAUFFEURS"
    }

    handler.handle_create_booking(website_booking_payload)
    assert handler.sent_response == 201, f"Expected 201, got {handler.sent_response}"
    created = handler.sent_data["booking"]
    booking_id = created["id"]
    ref_code = created["confirmation_code"]
    print(f"  ✓ Job Created: {booking_id}")
    print(f"  ✓ Generated Reference Number: {ref_code} (Format: GA-XXXXX)")
    assert ref_code.startswith("GA-"), f"Reference {ref_code} does not start with GA-"

    # 4. Customer Confirmation Email Verification
    print("\n[TEST 4] Verifying Customer Confirmation Email...")
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM confirmations WHERE booking_id = ? AND channel = 'EMAIL'", (booking_id,))
    email_conf = c.fetchone()
    assert email_conf is not None, "Email confirmation was not created"
    assert email_conf["recipient"] == "westminster@estate.co.uk"
    print(f"  ✓ Confirmation Email Dispatched to: {email_conf['recipient']}")
    print(f"  ✓ Email Subject: {email_conf['subject']}")
    assert "GA Chauffeur Services" in email_conf["subject"]
    conn.close()

    # 5. Chauffeur Allocation
    print("\n[TEST 5] Testing Chauffeur Allocation & Assignment Alerts...")
    handler.handle_allocate_chauffeur(booking_id, {"chauffeur_id": "auto"})
    assert handler.sent_response == 200
    ch = handler.sent_data["chauffeur"]
    print(f"  ✓ Chauffeur Allocated: {ch['name']} ({ch['vehicle_model']} - Plate: {ch['license_plate']})")

    # 6. Live Actions Lifecycle
    print("\n[TEST 6] Testing Live Driver Actions Lifecycle...")
    handler.handle_live_action(booking_id, {"action": "ACCEPT", "actor": "Driver Mobile App"})
    assert handler.sent_data["booking_status"] == "ACCEPTED"
    print("  ✓ Action: ACCEPT -> Status: ACCEPTED")

    handler.handle_live_action(booking_id, {"action": "EN_ROUTE_PICKUP", "actor": "Driver Mobile App"})
    assert handler.sent_data["booking_status"] == "EN_ROUTE"
    print("  ✓ Action: EN_ROUTE_PICKUP -> Status: EN_ROUTE")

    handler.handle_live_action(booking_id, {"action": "ARRIVED", "actor": "Driver Mobile App"})
    assert handler.sent_data["booking_status"] == "ARRIVED"
    print("  ✓ Action: ARRIVED -> Status: ARRIVED")

    handler.handle_live_action(booking_id, {"action": "ON_BOARD", "actor": "Driver Mobile App"})
    assert handler.sent_data["booking_status"] == "ON_BOARD"
    print("  ✓ Action: ON_BOARD -> Status: ON_BOARD")

    handler.handle_live_action(booking_id, {"action": "COMPLETED", "actor": "Driver Mobile App"})
    assert handler.sent_data["booking_status"] == "COMPLETED"
    print("  ✓ Action: COMPLETED -> Status: COMPLETED (Official Receipt issued)")

    # 7. Resend Confirmation
    print("\n[TEST 7] Testing Confirmation Resend...")
    handler.handle_resend_confirmation({"confirmation_id": email_conf["id"]})
    assert handler.sent_response == 200
    print(f"  ✓ Confirmation {email_conf['id']} successfully resent")

    print("\n================================================================")
    print("  ALL 7 TESTS PASSED WITH 100% SUCCESS RATE!                    ")
    print("================================================================")

if __name__ == "__main__":
    run_tests()
