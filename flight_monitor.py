"""Opt-in FlightByte Free adapter. No signup, upgrades, cards or paid fallback."""
import os,json,re,time,hmac,hashlib,urllib.request,urllib.error
from datetime import date,datetime,timezone

class MonitoringUnavailable(ValueError): pass

def ready():
    return os.environ.get('FLIGHTBYTE_FREE_CONFIRMED')=='1' and bool(os.environ.get('FLIGHTBYTE_API_KEY')) and len(os.environ.get('FLIGHTBYTE_WEBHOOK_SECRET',''))>=32

def schema(conn):
    conn.executescript('''CREATE TABLE IF NOT EXISTS flight_watches (booking_id TEXT PRIMARY KEY, subscription_id TEXT UNIQUE, flight_key TEXT, state TEXT NOT NULL, snapshot TEXT, fetched_at TEXT, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS flight_events (id TEXT PRIMARY KEY, received REAL NOT NULL);
CREATE TABLE IF NOT EXISTS flight_usage (id INTEGER PRIMARY KEY, created REAL NOT NULL, kind TEXT NOT NULL);''')

def reserve(conn,kind,limit):
    # Rolling 31 days is deliberately stricter than the provider's billing month.
    conn.execute('BEGIN IMMEDIATE')
    count=conn.execute('SELECT count(*) FROM flight_usage WHERE kind=? AND created>?',(kind,time.time()-31*86400)).fetchone()[0]
    if count>=limit:
        conn.rollback();raise MonitoringUnavailable('Free flight-monitoring allowance exhausted. Check the airline or airport manually.')
    conn.execute('INSERT INTO flight_usage(created,kind) VALUES (?,?)',(time.time(),kind));conn.commit()

def request(path,body=None,idem=None):
    headers={'x-api-key':os.environ['FLIGHTBYTE_API_KEY'],'Content-Type':'application/json'}
    if idem:headers['Idempotency-Key']=idem
    req=urllib.request.Request('https://api.flightbyte.dev/v1'+path,data=json.dumps(body).encode() if body else None,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=8) as response:return json.loads(response.read(500000))
    except urllib.error.HTTPError as error:
        if error.code in (402,429):raise MonitoringUnavailable('Free allowance reached. Manual flight check required.') from None
        raise MonitoringUnavailable('Flight could not be verified. Check the flight, departure date and airports manually.') from None
    except Exception:raise MonitoringUnavailable('Flight provider unavailable. Manual flight check required.') from None

def subscribe(conn,booking_id,data):
    if not ready():raise MonitoringUnavailable('Free flight monitoring is not connected.')
    schema(conn)
    old=conn.execute('SELECT state,subscription_id FROM flight_watches WHERE booking_id=?',(booking_id,)).fetchone()
    if old:return dict(state=old[0],subscription_id=old[1])
    carrier=str(data.get('carrier','')).upper().strip();number=str(data.get('flight_number','')).upper().strip()
    origin=str(data.get('origin','')).upper().strip();destination=str(data.get('destination','')).upper().strip()
    day=str(data.get('departure_date',''))
    try: delta=(date.fromisoformat(day)-datetime.now(timezone.utc).date()).days
    except ValueError:raise MonitoringUnavailable('Enter the flight’s local departure date, not the pickup date.')
    if not re.fullmatch(r'[A-Z0-9]{2,3}',carrier) or not re.fullmatch(r'\d{1,4}[A-Z]?',number) or not all(re.fullmatch(r'[A-Z]{3}',a) for a in (origin,destination)) or not -1<=delta<=90:
        raise MonitoringUnavailable('Enter airline code, flight number, local departure date and both airport IATA codes.')
    reserve(conn,'watch',3)
    # Persist reservation before network. An uncertain response is never retried as a new paid watch.
    conn.execute('INSERT INTO flight_watches(booking_id,state,created) VALUES (?,?,?)',(booking_id,'pending verification',time.time()));conn.commit()
    body=dict(carrier=carrier,flightNumber=number,date=day,origin=origin,destination=destination,webhookUrl='https://gachauffeurs.co.uk/api/flight-webhook',secret=os.environ['FLIGHTBYTE_WEBHOOK_SECRET'],metadata={'bookingId':booking_id})
    try:
        result=request('/subscriptions',body,'ga-flight-'+booking_id)
        sid=result.get('id');state=result.get('status')
        if not isinstance(sid,str) or state not in ('active','pending','suspended'):raise MonitoringUnavailable('Provider did not confirm monitoring. Manual check required.')
        conn.execute('UPDATE flight_watches SET subscription_id=?,flight_key=?,state=? WHERE booking_id=?',(sid,result.get('flightKey'),state,booking_id))
        conn.execute('UPDATE bookings SET flight_status=? WHERE id=?',('Flight monitoring '+state+' — awaiting verified flight status',booking_id));conn.commit()
        return dict(state=state,subscription_id=sid)
    except MonitoringUnavailable:
        conn.execute('UPDATE flight_watches SET state=? WHERE booking_id=?',('manual check required',booking_id));conn.commit();raise

def verify(raw,header,secret,now=None):
    try:
        parts=dict(piece.split('=',1) for piece in header.split(','));stamp=parts['t']
        if not secret or abs((now or time.time())-int(stamp))>300:return False
        expected=hmac.new(secret.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
        return hmac.compare_digest(parts['v1'],expected)
    except (ValueError,KeyError,TypeError):return False

def timestamp(value):
    try:return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
    except (ValueError,AttributeError,TypeError):return 0

def status(snapshot):
    phase=snapshot.get('status',{}).get('phase','unknown');fetched=snapshot.get('fetchedAt')
    if not timestamp(fetched) or time.time()-timestamp(fetched)>1800:return 'Flight status stale — manual check required'
    allowed={'scheduled','boarding','departed','en_route','landed','arrived','cancelled','diverted','redirected'}
    if phase not in allowed:return 'Flight status unknown — manual check required'
    return 'Flight '+phase.replace('_',' ')+' (updated '+fetched+')'

def receive(conn,raw,signature):
    if not ready() or not verify(raw,signature,os.environ.get('FLIGHTBYTE_WEBHOOK_SECRET','')):raise MonitoringUnavailable('Invalid webhook signature')
    event=json.loads(raw);schema(conn)
    sid=event.get('subscriptionId');eid=event.get('id')
    if not isinstance(eid,str) or len(eid)>200:raise MonitoringUnavailable('Invalid event')
    row=conn.execute('SELECT booking_id,flight_key,fetched_at FROM flight_watches WHERE subscription_id=?',(sid,)).fetchone()
    if not row:raise MonitoringUnavailable('Unknown subscription')
    conn.execute('BEGIN IMMEDIATE')
    if conn.execute('SELECT 1 FROM flight_events WHERE id=?',(eid,)).fetchone():conn.rollback();return
    conn.execute('INSERT INTO flight_events(id,received) VALUES (?,?)',(eid,time.time()))
    snapshot=event.get('flight') or {};fetched=snapshot.get('fetchedAt')
    if event.get('type')!='subscription.test' and snapshot and (not row[1] or snapshot.get('flightKey')==row[1]) and timestamp(fetched)>timestamp(row[2]):
        conn.execute('UPDATE flight_watches SET snapshot=?,fetched_at=? WHERE subscription_id=?',(json.dumps(snapshot),fetched,sid))
        conn.execute('UPDATE bookings SET flight_status=? WHERE id=?',(status(snapshot),row[0]))
    if event.get('type') in ('subscription.suspended','subscription.completed'):
        state=event['type'].split('.')[1]
        conn.execute('UPDATE flight_watches SET state=? WHERE subscription_id=?',(state,sid))
        conn.execute('UPDATE bookings SET flight_status=? WHERE id=?',('Monitoring '+state+' — check latest airline status',row[0]))
    conn.commit()
