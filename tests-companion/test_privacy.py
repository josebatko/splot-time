import sys,unittest,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
from privacy import public_status
class PrivacyTests(unittest.TestCase):
 def test_raw_context_and_unknown_fields_never_reach_local_status(self):
  secret='PRIVATE-CANARY-123'
  c={'deviceId':secret,'rules':{secret:secret},'siteRules':[secret],'decisions':{secret:secret},'phoneDevice':secret,'server':secret,'policy':'splot-context-v1','automatic':True}
  s={'state':'running','review':[{'title':secret,'url':secret}],'apps':[secret],'phoneDevices':[secret],'chromeBuckets':[secret],'error':secret,'chrome':secret,'unknown':secret,'reviewCount':99,'lastUpload':123.0,'pending':2}
  out=public_status(c,s)
  self.assertNotIn(secret,json.dumps(out));self.assertTrue(out['config']['deviceId']);self.assertEqual(out['status']['reviewCount'],0)
  self.assertEqual(set(out['config']),{'deviceId','automatic','startAtLogin','phoneEnabled','policy'})
 def test_errors_and_unexpected_status_values_are_sanitized(self):
  secret='PRIVATE-TITLE-URL'
  out=public_status({'policy':secret},{'state':'needs attention','iphone':secret,'lastUpload':secret,'pending':secret,'error':secret})
  self.assertNotIn(secret,json.dumps(out));self.assertIsNone(out['status']['lastUpload']);self.assertIsNotNone(out['status']['error'])
