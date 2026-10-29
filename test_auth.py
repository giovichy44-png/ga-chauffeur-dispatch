"""
Test Private Dispatch Authentication & Public Booking Widget Access.
"""
import base64
import server

def test_auth():
    print("\n--- Testing Private Dispatch Authentication & Public Widget Endpoints ---")
    
    # 1. Public endpoint test
    assert server.is_public_request("POST", "/api/bookings") is True, "POST /api/bookings must be public"
    assert server.is_public_request("GET", "/embed-booking-widget.js") is True, "embed script must be public"
    assert server.is_public_request("GET", "/api/quote") is True, "quote API must be public"
    assert server.is_public_request("GET", "/api/suggestions") is True, "suggestions API must be public"
    assert server.is_public_request("OPTIONS", "/api/bookings") is True, "CORS options must be public"
    print("  ✓ Public widget endpoints verified: all accessible without credentials")

    # 2. Private endpoint test
    assert server.is_public_request("GET", "/api/bookings") is False, "GET /api/bookings must be private"
    assert server.is_public_request("GET", "/api/chauffeurs") is False, "GET /api/chauffeurs must be private"
    assert server.is_public_request("GET", "/api/confirmations") is False, "GET /api/confirmations must be private"
    assert server.is_public_request("GET", "/") is False, "GET / (dashboard UI) must be private"
    assert server.is_public_request("GET", "/index.html") is False, "GET /index.html must be private"
    print("  ✓ Private console endpoints verified: all restricted to authorized users")

    # 3. Credentials check
    assert server.check_credentials("admin", "GAChauffeurs2026!") is True
    assert server.check_credentials("admin", "wrong_pass") is False
    assert server.check_credentials("unknown_user", "GAChauffeurs2026!") is False
    print("  ✓ Credentials validation working correctly")

    # 4. Auth header check (Basic Auth)
    token = base64.b64encode(b"admin:GAChauffeurs2026!").decode("utf-8")
    assert server.check_auth({"Authorization": f"Basic {token}"}) is True
    assert server.check_auth({"Authorization": "Basic invalid"}) is False
    print("  ✓ HTTP Basic Authentication header verified")

    # 5. Cookie auth check
    auth_token = server.get_auth_token()
    assert server.check_auth({"Cookie": f"ga_dispatch_auth={auth_token}"}) is True
    assert server.check_auth({"Cookie": "ga_dispatch_auth=wrong"}) is False
    print("  ✓ Persistent session cookie authentication verified")

    print("\nALL AUTHENTICATION TESTS PASSED 100%!")

if __name__ == "__main__":
    test_auth()
