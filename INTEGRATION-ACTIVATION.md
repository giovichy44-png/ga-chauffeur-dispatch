# November 4 integrations — staged, not activated

Canonical website: https://gachauffeurs.co.uk (Render). The old gachauffeurservices.co.uk is a separate Sites copy, not a redirect. Do not switch domains.

## Secure settings required
Use Render service ga-chauffeur-dispatch → Environment. Never put keys in chat, screenshots, Git or public JavaScript.

- `GOOGLE_MAPS_SERVER_KEY`: a separate server key permitting **Geocoding API** and **Routes API**. Enable these APIs in the existing Google Cloud project. Restrict to these APIs and, where available, the Render service's outbound IP ranges. Do not reuse a website-referrer-restricted browser key; never remove the browser key's restrictions.
- `QUOTE_SIGNING_SECRET`: independent cryptographically random secret of at least 32 characters. Generate privately (e.g. password manager); do not share it in chat.
- `SERVER_QUOTES_ENABLED=0`: leave disabled until Google route, UI review, Stripe sandbox amount and regression checks pass. Setting 1 requires signed server quotes for ALL booking submissions, including dispatch/widget clients. Unsupported older clients fail closed with refresh-quote message.
- `FLIGHTBYTE_API_KEY`: **new replacement key**, after revoking the key shown in the screenshot. Save directly in Render.
- `FLIGHTBYTE_WEBHOOK_SECRET`: independent random secret, minimum 32 characters.
- `FLIGHTBYTE_FREE_CONFIRMED=1`: set only after confirming the account remains on Free, with no card or paid plan. This connects only the Free adapter; no subscriptions are created automatically.

Free monitoring control: https://dispatch.gachauffeurs.co.uk/flight-monitor.html (existing dispatch login). Enter booking ID, airline code, flight number, **local departure date at origin** (not automatically pickup date), origin and destination IATA codes. This explicit selection avoids using the scarce free allowance on every booking. Existing booking completion is unaffected if monitoring is unavailable. Provider webhook URL is https://gachauffeurs.co.uk/api/flight-webhook, supplied by server.

Provider Free limit: 3 watched flights/month, 120 lookups; adapter makes subscription requests, not repeated lookup calls. Local persistent usage ledger additionally caps to 3 attempts per rolling31days. Failed/uncertain attempts count conservatively; no automatic retries/upgrades. Provider Free cap is still necessary if Render ephemeral disk loses the local ledger. Preserve the existing DB with a persistent disk before treating local history as durable. No paid fallback. The adapter never registers an account or accepts terms.

## Before switching signed quotes on
1. Deploy this commit with SERVER_QUOTES_ENABLED=0; confirm legacy booking scripts and postcode lookups remain working.
2. Store server credentials securely. Test real Routes/Geocoding with in/out, out/in, both-in and neither-in full addresses and boundary roads. Polygon charge is £18 final once, after existing tax on base/airport fees.
3. Use a staging/test Stripe configuration to verify the browser-reviewed quote matches the hold and stored/email totals, including tampered/expired token rejection. No real charge is authorized by deployment.
4. Check booking, homepage, pricing and embedded widget in browser. Signed quotes are invalidated on address/vehicle/service/duration edits. Driving path and metrics come from the same server response. No straight-line replacement.
5. Only then set SERVER_QUOTES_ENABLED=1 and verify production public quote responses without booking/charging.
6. For hourly “As directed”, only the known pickup endpoint is assessed; no invented destination or driving distance. A later specified drop-off needs a new quote.

## Airport fee correction
Charges use their own endpoint, ignoring a stale manually chosen service direction. £15 collection/meet-and-greet only at airport pickup; drop-off only at airport destination. Gatwick baseline £10 for first10min, verified Nov4: https://www.gatwickairport.com/transport-options/drop-off.html . Other previously configured drop-off rates preserved; not newly verified. Airport-to-airport can correctly have both endpoint fees. Existing VAT treatment of airport charges is retained. Exact £18 polygon surcharge remains gated by SERVER_QUOTES_ENABLED.

## Verification scope
Local tests cover signed amount reaching mocked Stripe (£396 example), changed-route token rejection before DB access, fee direction, zone combinations/boundaries, signature replay-age/tampering, event deduplication/order, stale flight data and hard quota. No Google authenticated request, real Stripe hold, customer booking, email or provider subscription has occurred. Browser tool reports browsers:[] in this chat. Live activation is not proven by these tests.
