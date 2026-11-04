"""Prepared, not activated: authoritative endpoint zone assessment and signed quotes."""
import base64
import hashlib
import hmac
import json
import math
import time
import urllib.request
import urllib.parse
from pathlib import Path

ZONE = json.loads(Path(__file__).with_name('congestion-zone.geojson').read_text())
SOURCE = 'https://www.arcgis.com/home/item.html?id=d93282183f124fa7b08763ed693cbdc5'

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

def geocode(address,key):
    if not key: raise QuoteUnavailable('Server-side Google Maps key is not configured.')
    url='https://maps.googleapis.com/maps/api/geocode/json?'+urllib.parse.urlencode({'address':address,'region':'gb','key':key})
    with urllib.request.urlopen(url,timeout=10) as response: data=json.load(response)
    results=data.get('results',[])
    if data.get('status')!='OK' or len(results)!=1 or results[0].get('partial_match'):
        raise QuoteUnavailable('Please choose an unambiguous full address.')
    if set(results[0].get('types',[])) & {'postal_code','locality','administrative_area_level_1','administrative_area_level_2'}:
        raise QuoteUnavailable('Choose the property or airport, rather than only a postcode or town.')
    return results[0]['geometry']['location']

def driving_route(pickup,dropoff,key):
    """Geometry, metrics and endpoint surcharge all derive from verified addresses."""
    p,d=geocode(pickup,key),geocode(dropoff,key)
    body={'origin':{'location':{'latLng':{'latitude':p['lat'],'longitude':p['lng']}}},'destination':{'location':{'latLng':{'latitude':d['lat'],'longitude':d['lng']}}},'travelMode':'DRIVE','routingPreference':'TRAFFIC_UNAWARE','polylineEncoding':'GEO_JSON_LINESTRING'}
    request=urllib.request.Request('https://routes.googleapis.com/directions/v2:computeRoutes',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring'})
    with urllib.request.urlopen(request,timeout=15) as response: data=json.load(response)
    routes=data.get('routes',[])
    if not routes: raise QuoteUnavailable('No driving route is available.')
    route=routes[0];path=route['polyline']['geoJsonLinestring']['coordinates']
    if len(path)<3: raise QuoteUnavailable('A complete road route could not be verified.')
    return {'path':path,'distance_miles':route['distanceMeters']/1609.344,'duration_minutes':float(route['duration'].rstrip('s'))/60,'pickup_location':p,'dropoff_location':d,'congestion_charge':surcharge(p,d)}

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
        return quote
    except Exception: raise QuoteUnavailable('Refresh your journey quote before confirming payment.') from None
