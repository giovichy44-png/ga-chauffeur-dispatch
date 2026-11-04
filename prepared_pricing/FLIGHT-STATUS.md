# Recommendation: FlightAware AeroAPI

For chauffeur arrival monitoring, use FlightAware AeroAPI or Cirium FlightStats Flight Status rather than FR24 as the primary status feed.

- https://www.flightaware.com/commercial/aeroapi/ — global flight status data, per-query/page usage pricing. Account subscription and server-side x-apikey required. Quote costs against actual journey volumes and polling frequency; no subscription purchased.
- https://developer.flightstats.com/api-docs/flightstatus/v2/flight — scheduled/estimated/actual departure and arrival, delay, terminal, gate and baggage carousel. Useful alternative; commercial account and coverage/price confirmation required.
- https://fr24api.flightradar24.com/docs/faq — FR24 currently says its API does not provide flight scheduling; live flights appear once the aircraft is being tracked. It should not be relied on alone for predeparture delays/cancellations or future airport pickup scheduling.

Proposed implementation: collect flight number, arrival local date and destination airport. Resolve marketing/codeshare identifiers to a unique provider flight ID and show the matched origin, destination and date for confirmation. Store UTC timestamps and show Europe/London local time. Distinguish actual landing from gate arrival (the existing 45-minute allowance starts after landing). Show last-updated time and a stale-data notice rather than implying constant live coverage. Poll conservatively during the relevant operating window, cache across bookings on the same flight, or use provider alerts if the chosen plan supports them. Alert dispatch to cancellation/diversion and material delays; do not silently change a confirmed pickup or charge. Set usage limits and audit the provider response freshness.

No API account, subscription, flight feed or automatic dispatch changes have been activated.
