"""Server-only quotes. Enable only after live Google and checkout verification."""
import os, time, threading, collections
from prepared_pricing import zone_quote as zone

_lock=threading.RLock()
_cache=collections.OrderedDict()
_limits={}

def enabled(): return os.environ.get('SERVER_QUOTES_ENABLED') == '1'
def ready(): return bool(os.environ.get('GOOGLE_MAPS_SERVER_KEY') and len(os.environ.get('QUOTE_SIGNING_SECRET',''))>=32)

def inputs(data,normalize):
    pickup=str(data.get('pickup') or data.get('pickup_address') or '').strip()
    dropoff=str(data.get('dropoff') or data.get('dropoff_address') or '').strip()
    vehicle=normalize(data.get('vehicle') or data.get('vehicle_class'))
    service=str(data.get('service') or data.get('service_type') or 'Point-to-point transfer').strip()
    try: hours=int(data.get('hours') or data.get('hours_booked') or 0)
    except (ValueError,TypeError): raise zone.QuoteUnavailable('Select a valid duration.')
    if not pickup or not dropoff or len(pickup)>500 or len(dropoff)>500 or not 0<=hours<=72:
        raise zone.QuoteUnavailable('Enter complete pickup and drop-off addresses and a valid duration.')
    if 'hourly' in service.lower() and hours<2: hours=2
    return dict(pickup=pickup,dropoff=dropoff,vehicle=vehicle,service=service,hours=hours)

def issue(data,normalize,tariff,client, *, preview=False):
    if (not enabled() and not preview) or not ready(): raise zone.QuoteUnavailable('Verified journey quotes are not available yet.')
    spec=inputs(data,normalize);now=time.time()
    with _lock:
        # Bound both per-client and total spend; trust socket address, not supplied forwarding headers.
        for key in list(_limits):
            if _limits[key][0]<now-60: del _limits[key]
        for key,cap in [(client,20),('__global__',120)]:
            start,count=_limits.get(key,(now,0))
            if count>=cap: raise zone.QuoteUnavailable('Too many quote requests. Please wait a minute.')
            _limits[key]=(start,count+1)
        cache_key=(spec['pickup'],spec['dropoff'])
        cached=_cache.get(cache_key)
        if cached and cached[0]>now: route=cached[1]
        else: route=None
    if route is None:
        key=os.environ['GOOGLE_MAPS_SERVER_KEY']
        if spec['dropoff'].lower()=='as directed' and 'hourly' in spec['service'].lower():
            p=zone.geocode(spec['pickup'],key)
            route=dict(path=[],distance_miles=0,duration_minutes=0,pickup_location=p,dropoff_location=p,congestion_charge=zone.surcharge(p,p),as_directed=True)
        else: route=zone.driving_route(spec['pickup'],spec['dropoff'],key)
        with _lock:
            _cache[cache_key]=(now+300,route)
            while len(_cache)>200: _cache.popitem(last=False)
    fare=tariff(spec['vehicle'],spec['service'],spec['pickup'],spec['dropoff'],spec['hours'],route['distance_miles'])
    amounts=zone.totals(fare['net_fare'],fare['parking_fee'],fare['dropoff_fee'],route['congestion_charge'])
    summary=dict(spec,**amounts,distance_miles=route['distance_miles'],duration_minutes=route['duration_minutes'],pickup_location=route['pickup_location'],dropoff_location=route['dropoff_location'],service_label=fare['service_label'])
    return dict(summary,path=route['path'],as_directed=route.get('as_directed',False),expires=int(now)+900,quote_token=zone.sign_quote(summary,os.environ['QUOTE_SIGNING_SECRET'],now))

def accept(payload,normalize):
    if not ready(): raise zone.QuoteUnavailable('Verified journey quotes are not available yet.')
    token=payload.get('quote_token','')
    if not isinstance(token,str) or len(token)>16000: raise zone.QuoteUnavailable('Refresh your journey quote.')
    return zone.verify_quote(token,os.environ['QUOTE_SIGNING_SECRET'],inputs(payload,normalize))
