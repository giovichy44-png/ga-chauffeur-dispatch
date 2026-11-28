import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import db
import dispatch_invoices
import server


class DispatchBookingChanges(unittest.TestCase):
    def test_gatwick_area_to_heathrow_uses_return_route(self):
        fare = server.calculate_fare("mercedes_s_class", "Airport departure", "Crawley RH11", "Heathrow T2",
                                     base_to_base_miles=110, base_to_base_minutes=180)
        self.assertEqual((fare["billable_hours"], fare["included_miles"], fare["excess_miles"]), (3, 30, 80))
        vehicle = server.VEHICLE_CONFIGS["mercedes_s_class"]
        self.assertEqual(fare["net_fare"], 3 * vehicle["hourly_rate"] + 80 * vehicle["excess_mile_rate"])
        self.assertEqual(fare["parking_fee"], 0)
        fixed = server.calculate_fare("mercedes_s_class", None, "London NW11", "Heathrow T2")
        self.assertEqual(fixed["net_fare"], vehicle["heathrow_rate"])

    def test_dispatch_defaults_to_silent_and_both_jobs_share_invoice(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(db, "DB_FILE", str(Path(folder) / "test.db")), \
             patch.dict(os.environ, {"SERVER_QUOTES_ENABLED": "off"}), patch.object(server, "check_auth", return_value=True), \
             patch.object(server, "send_smtp_email") as send, patch.object(server, "broadcast_event"):
            db.init_db()
            handler = next(c for c in vars(server).values() if isinstance(c, type) and hasattr(c, "handle_create_booking"))
            handler = handler.__new__(handler)
            handler.headers = {}
            handler.send_customer_confirmation = Mock(return_value=(True, "Sent."))
            handler.send_json = Mock()
            payload = {
                "source": "DISPATCH_PORTAL", "customer_name": "Test Family", "customer_email": "test@example.invalid",
                "pickup_address": "London NW11", "dropoff_address": "Heathrow T2",
                "pickup_datetime": "2026-12-13 15:00", "vehicle_class": "mercedes_v_class",
                "corporate_invoice_name": "Test Account", "passenger_count": 0,
            }
            handler.handle_create_booking(dict(payload))
            first, code = handler.send_json.call_args.args
            self.assertEqual(code, 201)
            handler.handle_create_booking(dict(payload, pickup_datetime="2026-12-20 15:45"))
            second, code = handler.send_json.call_args.args
            self.assertEqual(code, 201)
            invoice_id = first["booking"]["invoice_id"]
            self.assertEqual(invoice_id, second["booking"]["invoice_id"])
            handler.send_customer_confirmation.assert_not_called()
            send.assert_not_called()
            with db.get_connection() as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0], 1)
                invoice = conn.execute("SELECT total_pence,delivery FROM invoices WHERE id=?", (invoice_id,)).fetchone()
                self.assertEqual(invoice["delivery"], "draft")
                self.assertEqual(invoice["total_pence"], dispatch_invoices.pence(
                    first["booking"]["total_fare"] + second["booking"]["total_fare"]))
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM corporate_invoice_bookings").fetchone()[0], 2)
            handler.handle_create_booking(dict(payload, source="WEBSITE_GACHAUFFEURS", customer_phone="0123456789",
                                               send_confirmation=False, pickup_datetime="2026-12-21 09:00"))
            handler.send_customer_confirmation.assert_called_once()
            send.assert_called_once()

    def test_cancel_refunds_captured_intent_with_stable_idempotency(self):
        with patch.object(server, "stripe_api_request", side_effect=[
            {"id": "pi_test", "status": "succeeded"},
            {"id": "re_test", "status": "pending"},
        ]) as stripe:
            status, _ = server.cancel_stripe_booking_payment("pi_test")
        self.assertEqual(status, "REFUND_PENDING")
        self.assertEqual(stripe.call_args.args, ("refunds",))
        self.assertEqual(stripe.call_args.kwargs["data"], {"payment_intent": "pi_test"})
        self.assertEqual(stripe.call_args.kwargs["idempotency_key"], "ga-booking-refund-pi_test")

    def test_cancel_releases_uncaptured_hold_without_refund(self):
        with patch.object(server, "stripe_api_request", side_effect=[
            {"id": "pi_test", "status": "requires_capture"},
            {"id": "pi_test", "status": "canceled"},
        ]) as stripe:
            status, _ = server.cancel_stripe_booking_payment("pi_test")
        self.assertEqual(status, "HOLD_RELEASED")
        self.assertEqual(stripe.call_args.args, ("payment_intents/pi_test/cancel",))
