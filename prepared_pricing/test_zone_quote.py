import unittest
from zone_quote import *
class ZoneTests(unittest.TestCase):
    def test_endpoint_combinations(self):
        inside={'lat':51.5103,'lng':-.1206};outside={'lat':51.8860,'lng':.2389}
        self.assertEqual([surcharge(outside,outside),surcharge(inside,outside),surcharge(outside,inside),surcharge(inside,inside)],[0,18,18,18])
        self.assertFalse(in_zone({'lat':51.4994,'lng':-.1635})) # Knightsbridge, not a postcode-prefix approximation
    def test_boundary_and_holes(self):
        ring=[[0,0],[2,0],[2,2],[0,2],[0,0]]
        self.assertIsNone(ring_contains((0,1),ring));self.assertTrue(ring_contains((1,1),ring));self.assertFalse(ring_contains((3,1),ring))
        for f in ZONE['features']:
            lng,lat=f['geometry']['coordinates'][0][0][:2]
            self.assertFalse(in_zone({'lat':lat,'lng':lng}))
    def test_unknown_not_zero(self):
        for value in [None,{}, {'lat':float('nan'),'lng':0}]:
            with self.assertRaises(QuoteUnavailable):surcharge({'lat':51.5,'lng':0},value)
    def test_signed_quote_and_total(self):
        expected={'pickup':'A','dropoff':'B','vehicle':'s','service':'transfer','hours':0}
        q=dict(expected,**totals(305,15,0,18));self.assertEqual(q['total_fare'],402)
        token=sign_quote(q,'test-only',1000)
        self.assertEqual(verify_quote(token,'test-only',expected,1001)['total_fare'],402)
        for bad,ex,t in [(token+'0',expected,1001),(token,dict(expected,dropoff='C'),1001),(token,expected,2000)]:
            with self.assertRaises(QuoteUnavailable):verify_quote(bad,'test-only',ex,t)
if __name__=='__main__': unittest.main()
