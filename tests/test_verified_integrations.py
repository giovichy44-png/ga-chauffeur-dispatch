import unittest,os,json,time,hmac,hashlib,sqlite3
from unittest.mock import patch,MagicMock
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server,quote_service,flight_monitor
from prepared_pricing import zone_quote as zone

class Integrations(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,{'SERVER_QUOTES_ENABLED':'1','GOOGLE_MAPS_SERVER_KEY':'test-only','QUOTE_SIGNING_SECRET':'s'*40,'FLIGHTBYTE_API_KEY':'test-only','FLIGHTBYTE_WEBHOOK_SECRET':'w'*40,'FLIGHTBYTE_FREE_CONFIRMED':'1'});self.env.start();self.addCleanup(self.env.stop)
  quote_service._cache.clear();quote_service._limits.clear()
 def test_airport_fees_use_endpoints_not_stale_service(self):
  q=server.calculate_fare('mercedes_s_class','Airport arrival','35 Ashchurch Park Villas, London','Gatwick Airport')
  self.assertEqual((q['parking_fee'],q['dropoff_fee']),(0,10))
  q=server.calculate_fare('mercedes_s_class','Airport departure','Gatwick Airport','35 Ashchurch Park Villas, London')
  self.assertEqual((q['parking_fee'],q['dropoff_fee']),(15,0))
  q=server.calculate_fare('mercedes_s_class',None,'Heathrow Airport','Gatwick Airport')
  self.assertEqual((q['parking_fee'],q['dropoff_fee']),(15,10))
 def test_server_quote_ignores_client_price_and_stripe_uses_signed_total(self):
  spec=dict(pickup='35 Ashchurch Park Villas, London',dropoff='Gatwick Airport',vehicle='mercedes_s_class',service='Airport departure',hours=0)
  route=dict(path=[[-.2,51.5],[-.15,51.4],[-.1,51.2]],distance_miles=40,duration_minutes=65,pickup_location={'lat':51.5,'lng':-.2},dropoff_location={'lat':51.2,'lng':-.1},congestion_charge=18)
  with patch.object(zone,'driving_route',return_value=route):q=quote_service.issue(spec,server.normalize_vehicle_tier,server.calculate_fare,'test')
  self.assertEqual(q['total_fare'],396) # (305+10)*1.2 +18
  p=dict(customer_name='Test',customer_email='test@example.invalid',customer_phone='0',pickup_address=spec['pickup'],dropoff_address=spec['dropoff'],vehicle_class=spec['vehicle'],service_type=spec['service'],hours=0,pickup_datetime='2026-12-01 10:00',quote_token=q['quote_token'],total_fare=1,parking_fee=999,payment_method_id='pm_test')
  handler=server.DispatchHandler.__new__(server.DispatchHandler) if hasattr(server,'DispatchHandler') else None
  if handler is None:
   cls=next(v for v in vars(server).values() if isinstance(v,type) and hasattr(v,'handle_create_booking'));handler=cls.__new__(cls)
  handler.send_json=MagicMock()
  with patch.object(server.db,'get_connection',return_value=MagicMock()),patch.object(server,'STRIPE_SECRET_KEY','test-only'),patch.object(server,'stripe_create_preauth_hold',return_value={'error':'intentional test stop'}) as stripe:
   handler.handle_create_booking(p)
   self.assertEqual(stripe.call_args.kwargs['amount_gbp'],396)
  p['dropoff_address']='Different destination'
  with patch.object(server.db,'get_connection') as conn:
   handler.handle_create_booking(p);conn.assert_not_called()
 def test_webhook_signature_timestamp(self):
  raw=b'{"id":"test"}';stamp=str(int(time.time()));secret='w'*40
  sig=hmac.new(secret.encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
  self.assertTrue(flight_monitor.verify(raw,'t='+stamp+',v1='+sig,secret))
  self.assertFalse(flight_monitor.verify(raw+b' ','t='+stamp+',v1='+sig,secret))
  self.assertFalse(flight_monitor.verify(raw,'t='+stamp+',v1='+sig,secret,now=int(stamp)+301))
 def test_quota_is_hard_capped(self):
  conn=sqlite3.connect(':memory:');flight_monitor.schema(conn)
  for _ in range(3):flight_monitor.reserve(conn,'watch',3)
  with self.assertRaises(flight_monitor.MonitoringUnavailable):flight_monitor.reserve(conn,'watch',3)
 def test_stale_flight_not_reported_current(self):
  self.assertIn('stale',flight_monitor.status({'status':{'phase':'landed'},'fetchedAt':'2020-01-01T00:00:00Z'}))
 def test_webhooks_deduplicate_and_ignore_out_of_order(self):
  c=sqlite3.connect(':memory:');c.execute('CREATE TABLE bookings(id TEXT,flight_status TEXT)');c.execute("INSERT INTO bookings VALUES ('BK-test','pending')");c.commit();flight_monitor.schema(c)
  c.execute("INSERT INTO flight_watches(booking_id,subscription_id,flight_key,state,created) VALUES ('BK-test','sub1','BA1:date@JFK-LHR','active',0)");c.commit()
  from datetime import datetime,timezone
  fetched=datetime.now(timezone.utc).isoformat()
  event={'id':'evt1','subscriptionId':'sub1','type':'flight.updated','flight':{'flightKey':'BA1:date@JFK-LHR','fetchedAt':fetched,'status':{'phase':'landed'}}}
  def send(e):
   raw=json.dumps(e).encode();stamp=str(int(time.time()));sig=hmac.new(('w'*40).encode(),stamp.encode()+b'.'+raw,hashlib.sha256).hexdigest();flight_monitor.receive(c,raw,'t='+stamp+',v1='+sig)
  send(event);send(event)
  self.assertEqual(c.execute('SELECT count(*) FROM flight_events').fetchone()[0],1)
  event['id']='evt2';event['flight']['fetchedAt']='2020-01-01T00:00:00Z';event['flight']['status']['phase']='scheduled';send(event)
  self.assertIn('landed',c.execute('SELECT flight_status FROM bookings').fetchone()[0])

if __name__=='__main__':unittest.main()
