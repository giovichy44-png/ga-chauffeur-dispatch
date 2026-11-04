# Prepared pricing integration — NOT ACTIVE

The live Render service continues its existing booking/payment behavior. This directory is not imported by server.py. Do not enable the new zone pricing until the steps below are completed and tested.

## Verified boundary and policy
- TfL ArcGIS item d93282183f124fa7b08763ed693cbdc5, layer 8 (CLoCCS), downloaded 4 November 2026.
- https://www.arcgis.com/home/item.html?id=d93282183f124fa7b08763ed693cbdc5
- TfL describes it as the boundary captured in the deposited plans signed off by the Mayor. Attribution: Transport for London, Open Government Licence v3.
- Uses polygon rings and holes, not postcodes or a bounding rectangle. An endpoint exactly on the boundary is excluded, matching the boundary-road exclusion. Missing/ambiguous locations require resolution; never silently assume zero.
- Business rule: add £18 once if either verified endpoint is inside. A route merely crossing the zone does not qualify. No day/time exemptions. The £18 is the final additional amount; confirm this treatment before activation if a different tax treatment is intended.

## Still required before activation
1. Configure GOOGLE_MAPS_SERVER_KEY on Render with Geocoding API and Routes API; keep it server-only. Configure a random QUOTE_SIGNING_SECRET.
2. Wire a rate-limited server quote endpoint to driving_route(), existing tariff calculation and totals(). It must return the exact path, distance, duration and signed full price in the same response. Cache geocoding and route requests, with bounded memory and expiry.
3. Homepage, booking and embedded widget must consume that single quote response and show 'London congestion-zone surcharge' separately from airport parking/drop-off. Clear the quote immediately when addresses, service, duration or vehicle change. No fabricated straight-line fallback.
4. In POST /api/bookings, verify_quote() must check expiry plus pickup, dropoff, vehicle, service and hours before opening the database or calling Stripe. Use ONLY signed server totals/metrics. Remove current payload overrides for total_fare, congestion_charge, parking_fee, dropoff_fee, estimated_distance_mi and estimated_duration_min. Never activate only the browser calculation.
5. Return final accepted totals to the browser; confirmation email/receipt must use these same stored amounts. Existing build_luxury_email_html recomputes amounts and omits the drop-off fee; update it before activation.
6. Verify live Google geocoding and Routes responses, selected endpoints, both inputs, all four zone combinations, boundary cases, expired/tampered tokens and Stripe test-mode amount. No live financial action is required for unit tests.

## Tests completed
python3 prepared_pricing/test_zone_quote.py: inside/outside combinations, boundary points, point-in-ring edge behavior, unknown/invalid locations, once-only £18 total, signed token tampering, changed address, expiry.

No Google server calls were made; no credential was supplied; no customer emails or payments were generated. This is prepared core logic, not an activated or end-to-end-verified pricing integration.
