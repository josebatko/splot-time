import sys, unittest, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
from core import summarize, split_days, Queue, merge

def event(app,start=0,duration=600):
    return {'timestamp':f'2026-10-12T10:{start:02d}:00Z','duration':duration,'data':{'app':app}}
class CoreTests(unittest.TestCase):
    def test_idle_unknown_and_overlap(self):
        afk=[{**event('',duration=300),'data':{'status':'not-afk'}}]
        result=summarize([event('Code'),event('Safari')],afk,[event('Slack')],{'Code':'Product & Engineering','Slack':'Sales & Partnerships'},[],now=2000000000)
        self.assertEqual(sum(b-a for a,b in merge([[e['start'],e['end']] for e in result])),600000)
        self.assertEqual(next(e for e in result if e['project']=='Product & Engineering')['end']-result[0]['start'],300000)
    def test_pause_and_missing_afk(self):
        self.assertEqual(summarize([event('Code')],[],[],{'Code':'Product & Engineering'},[]),[])
        from core import span
        s,e=span(event('Slack'))
        self.assertEqual(summarize([],[],[event('Slack')],{'Slack':'Sales & Partnerships'},[(s,e)],now=2000000000),[])
    def test_midnight_split(self):
        import datetime as dt
        a=int(dt.datetime.fromisoformat('2026-10-12T21:30:00+00:00').timestamp()*1000)
        self.assertEqual(set(split_days([{'start':a,'end':a+3600000,'project':'x'}],'Europe/Warsaw')),{'2026-10-12','2026-10-13'})
    def test_queue_survives_failure_restart_and_keeps_revision(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'queue.db';q=Queue(path);q.put('2026-10-12',[],'ok')
            with self.assertRaises(OSError):q.flush(lambda _:(_ for _ in ()).throw(OSError()))
            q.db.close();q=Queue(path);self.assertEqual(q.pending(),1)
            seen=[]
            q.flush(lambda x:seen.append(x) or {'accepted':True,'revision':x['revision']})
            self.assertEqual(q.pending(),0);q.put('2026-10-12',[],'paused');q.flush(lambda x:seen.append(x) or {'accepted':True,'revision':x['revision']});self.assertEqual([x['revision'] for x in seen],[1,2]);q.db.close()
    def test_repair_requeues_history(self):
        with tempfile.TemporaryDirectory() as d:
            q=Queue(Path(d)/'q.db');q.device('first');q.put('2026-10-12',[],'ok')
            q.flush(lambda p:{'accepted':True,'revision':p['revision']})
            q.device('first');self.assertEqual(q.pending(),0)
            q.device('second');self.assertEqual(q.pending(),1);q.db.close()
    def test_api_uses_supported_limit_and_refuses_truncation(self):
        from unittest.mock import patch
        from core import ActivityWatch
        with patch('core.json_request',return_value=[]) as request:
            self.assertEqual(ActivityWatch().events('bucket','2026-10-12T00:00:00Z'),[])
            self.assertIn('limit=100001',request.call_args[0][0])
            self.assertNotIn('offset',request.call_args[0][0])
        with patch('core.json_request',return_value=[{}]*100001):
            with self.assertRaises(ValueError):ActivityWatch().events('b','2026-10-12T00:00:00Z')
if __name__=='__main__':unittest.main()
