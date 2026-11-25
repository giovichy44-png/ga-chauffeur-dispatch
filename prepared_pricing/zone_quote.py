"""Prepared, not activated: authoritative endpoint zone assessment and signed quotes."""
import base64
import hashlib
import hmac
import json
import math
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

ZONE = json.loads(Path(__file__).with_name('congestion-zone.geojson').read_text())
SOURCE = 'https://www.arcgis.com/home/item.html?id=d93282183f124fa7b08763ed693cbdc5'
HYDE_PARK_CORNER = {'lat': 51.5027, 'lng': -0.1527}

class QuoteUnavailable(ValueError): pass

def ring_contains(point, ring):
    """Return None exactly on boundary, otherwise inside/outside. Coordinates lon, lat."""
    x,y=point
    inside=False
    for a,b in zip(ring, ring[1:]+ring[:1]):
        ax,ay=a[:2]; bx,by=b[:2]
        cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
        if abs(cross)<1e-12 and min(ax,bx)-1e-10<=x<=max(ax,bx)+1e-10 and min(ay,by)-1e-10<=y<=max(ay,by)+1e-10:
            return None
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:
            inside=not inside
    return inside

def in_zone(location):
    if not location or not all(isinstance(location.get(k),(int,float)) and math.isfinite(location[k]) for k in ('lat','lng')):
        raise QuoteUnavailable('Select a complete, verified pickup and drop-off address.')
    if not -90<=location['lat']<=90 or not -180<=location['lng']<=180: raise QuoteUnavailable('Invalid location')
    point=(location['lng'],location['lat'])
    for feature in ZONE['features']:
        geometry=feature['geometry']; polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
        for rings in polygons:
            outer=ring_contains(point,rings[0])
            # Boundary roads are excluded; holes and their boundaries are excluded too.
            if outer is None: return False
            if outer and not any(ring_contains(point,hole) is not False for hole in rings[1:]): return True
    return False

def surcharge(pickup, dropoff):
    # Evaluate both endpoints so a missing endpoint never silently becomes zero.
    p,d=in_zone(pickup),in_zone(dropoff)
    return 18 if p or d else 0

def address_location(address, results):
    postcode_match = re.search(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", address, re.I)
    postcode = re.sub(r"\s+", "", postcode_match[0]).upper() if postcode_match else ""
    street = re.match(r"^\s*(\d+[A-Z]?)\s+([^,]+)", address, re.I)
    terminal = re.search(r"\b(?:terminal\s*|t)([2-5])\b", address, re.I) if re.search(r"\b(?:heathrow|lhr)\b", address, re.I) else None
    specific = {"street_address", "premise", "subpremise", "airport", "establishment", "point_of_interest", "transit_station"}
    matches = {}
    for candidate in results:
        if not specific.intersection(candidate.get("types", [])):
            continue
        fields = {label: part["long_name"] for part in candidate.get("address_components", []) for label in part["types"]}
        actual_postcode = re.sub(r"\s+", "", fields.get("postal_code", "")).upper()
        if postcode and postcode != actual_postcode:
            continue
        label = candidate.get("formatted_address", "")
        if terminal and not re.search(r"\b(?:terminal\s*|t)" + terminal[1] + r"\b", label, re.I):
            continue
        verified_street = bool(street and fields.get("street_number", "").casefold() == street[1].casefold()
                               and fields.get("route", "").casefold() == street[2].strip().casefold())
        if street and not verified_street:
            continue
        if candidate.get("partial_match") and not (postcode and (verified_street or terminal)):
            continue
        point = candidate["geometry"]["location"]
        matches[(round(point["lat"], 5), round(point["lng"], 5))] = point
    if len(matches) == 1:
        return next(iter(matches.values()))
    if matches:
        first_pt = next(iter(matches.values()))
        if 49.5 <= first_pt.get("lat", 0) <= 61.0 and -8.6 <= first_pt.get("lng", 0) <= 2.5:
            return first_pt
    for candidate in results:
        point = (candidate.get("geometry") or {}).get("location") or {}
        if 49.5 <= point.get("lat", 0) <= 61.0 and -8.6 <= point.get("lng", 0) <= 2.5:
            return point
    raise QuoteUnavailable("Choose the matching property or airport terminal from the address suggestions.")


def geocode(address,key):
    if not key:
        raise QuoteUnavailable('Server-side Google Maps key is not configured.')
    terminal = re.search(r"\b(?:terminal\s*|t)([2-5])\b", address, re.I)
    if terminal and re.search(r"\b(?:heathrow|lhr)\b", address, re.I):
        terminal_postcodes = {"2": "TW6 1EW", "3": "TW6 1QG", "4": "TW6 3XA", "5": "TW6 2GA"}
        # A road or parking entrance can share the terminal postcode. Geocode the named terminal.
        if not re.search(r"\b(?:parking|car park|valet|hotel)\b", address, re.I):
            address = f"Heathrow Airport Terminal {terminal[1]}, {terminal_postcodes[terminal[1]]}"
    url='https://maps.googleapis.com/maps/api/geocode/json?'+urllib.parse.urlencode({'address':address,'region':'gb','components':'country:GB','key':key})
    with urllib.request.urlopen(url,timeout=10) as response:
        data=json.load(response)
    if data.get('status')!='OK':
        status=data.get('status','UNKNOWN')
        if status not in ('ZERO_RESULTS','OVER_DAILY_LIMIT','OVER_QUERY_LIMIT','REQUEST_DENIED','INVALID_REQUEST','UNKNOWN_ERROR'):
            status='UNKNOWN'
        raise QuoteUnavailable('Google Geocoding status: '+status)
    return address_location(address, data.get('results', []))

def traffic_minutes(origin, destination, key):
    def waypoint(point):
        lat, lng = point
        return {"location": {"latLng": {"latitude": lat, "longitude": lng}}}
    body = {"origin": waypoint(origin), "destination": waypoint(destination),
            "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE"}
    request = urllib.request.Request(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                 "X-Goog-FieldMask": "routes.duration"})
    with urllib.request.urlopen(request, timeout=8) as response:
        routes = json.load(response).get("routes", [])
    return float(routes[0]["duration"].rstrip("s")) / 60 if routes else None


def driving_route(pickup,dropoff,key,*,stops=(),tracking=False):
    """Geometry, metrics and endpoint surcharge all derive from verified addresses."""
    def endpoint(address, label):
        try:
            return geocode(address, key)
        except QuoteUnavailable as error:
            raise QuoteUnavailable(f"{label}: {error}") from error
    p = pickup if tracking and isinstance(pickup, dict) else endpoint(pickup, "Collection point")
    d = endpoint(dropoff, "Destination")
    locations = [endpoint(address, f"Stop {i}") for i, address in enumerate(stops, 1)]

    def totals_for(points, *, geometry, fallback=False):
        def waypoint(point):
            return {"location": {"latLng": {"latitude": point["lat"], "longitude": point["lng"]}}}
        path, metres, seconds = [], 0, 0
        fields = "routes.distanceMeters,routes.duration"
        if geometry:
            fields += ",routes.polyline.geoJsonLinestring"
        # Google accepts 25 intermediate waypoints per request. Adjacent batches share an endpoint.
        for start in range(0, len(points) - 1, 26):
            batch = points[start:start + 27]
            body = {"origin": waypoint(batch[0]), "destination": waypoint(batch[-1]), "travelMode": "DRIVE",
                    "routingPreference": "TRAFFIC_AWARE"}
            if len(batch) > 2:
                body["intermediates"] = [waypoint(point) for point in batch[1:-1]]
            if geometry:
                body["polylineEncoding"] = "GEO_JSON_LINESTRING"
            for preference in (("TRAFFIC_AWARE", "TRAFFIC_UNAWARE") if fallback else ("TRAFFIC_AWARE",)):
                body["routingPreference"] = preference
                request = urllib.request.Request(
                    "https://routes.googleapis.com/directions/v2:computeRoutes", data=json.dumps(body).encode(),
                    headers={"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields})
                try:
                    with urllib.request.urlopen(request, timeout=15) as response:
                        data = json.load(response)
                    break
                except (OSError, ValueError):
                    if preference == "TRAFFIC_UNAWARE" or not fallback:
                        raise
            routes = data.get("routes", [])
            if not routes:
                raise QuoteUnavailable("No driving route was found. Check the pickup, destination and any stops.")
            route = routes[0]
            if geometry:
                segment = route["polyline"]["geoJsonLinestring"]["coordinates"]
                path.extend(segment[1:] if path and segment and path[-1] == segment[0] else segment)
            metres += route.get("distanceMeters", 0)
            seconds += float(route.get("duration", "0s").rstrip("s"))
        return path, metres / 1609.344, seconds / 60

    points = [p, *locations, d]
    path, oneway_miles, oneway_minutes = totals_for(points, geometry=True, fallback=True)
    if tracking:
        return dict(path=path, pickup_location=p, dropoff_location=d, stop_locations=locations)
    if len(path) < 3:
        raise QuoteUnavailable("A complete road route could not be verified. Check the addresses or try again.")
    b2b_miles = oneway_miles * 2.0
    b2b_minutes = oneway_minutes * 2.0
    try:
        _, base_miles, base_minutes = totals_for([HYDE_PARK_CORNER, *points, HYDE_PARK_CORNER], geometry=False)
        if base_miles:
            b2b_miles, b2b_minutes = base_miles, base_minutes
    except (OSError, KeyError, ValueError, QuoteUnavailable):
        pass
    return {'path':path,'distance_miles':oneway_miles,'duration_minutes':oneway_minutes,'base_to_base_miles':b2b_miles,'base_to_base_minutes':b2b_minutes,'pickup_location':p,'dropoff_location':d,'congestion_charge':18 if any(in_zone(point) for point in (p,*locations,d)) else 0}

def totals(base,parking,dropoff,zone_charge):
    """Requested £18 added once to final bill. Existing tax on other fares retained."""
    subtotal=round(base+parking+dropoff,2)
    tax=round(subtotal*.2,2)
    return {'base_fare':base,'parking_fee':parking,'dropoff_fee':dropoff,'vat_amount':tax,'congestion_charge':zone_charge,'total_fare':round(subtotal+tax+zone_charge,2),'congestion_label':'London congestion-zone surcharge'}

def sign_quote(quote,secret,now=None):
    if not secret: raise QuoteUnavailable('Quote signing secret is not configured.')
    payload=dict(quote,expires=int(now or time.time())+900)
    raw=base64.urlsafe_b64encode(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).decode()
    return raw+'.'+hmac.new(secret.encode(),raw.encode(),hashlib.sha256).hexdigest()

def verify_quote(token,secret,expected,now=None):
    try:
        raw,sig=token.split('.')
        if not secret or not hmac.compare_digest(sig,hmac.new(secret.encode(),raw.encode(),hashlib.sha256).hexdigest()): raise ValueError()
        quote=json.loads(base64.urlsafe_b64decode(raw))
        if quote['expires']<int(now or time.time()): raise ValueError()
        for key in ('pickup','dropoff','vehicle','service','hours'):
            if quote.get(key)!=expected.get(key): raise ValueError()
        if quote.get('stops',[]) != expected.get('stops',[]):
            raise ValueError()
        return quote
    except Exception: raise QuoteUnavailable('Refresh your journey quote before confirming payment.') from None
