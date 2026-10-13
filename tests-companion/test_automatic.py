import unittest
from test_context import event,afk,duration,NOW
from core import classify_capture,span
class AutomaticTests(unittest.TestCase):
 def test_selected_apps_count_personal_sites_without_review_but_idle_and_other_apps_do_not(self):
  c={'automatic':True,'rules':{'Google Chrome':'Selected work apps','ChatGPT':'Selected work apps'}}
  rows,review=classify_capture([event(url='https://personal.test'),event('Unselected')],afk(120),[],[],c,now=NOW)
  self.assertEqual(duration(rows),120);self.assertEqual(review,[])
  self.assertEqual(set(rows[0]),{'start','end','project'})
 def test_pause_private_and_iphone_overlap(self):
  e=event();a,b=span(e)
  c={'automatic':True,'rules':{'Google Chrome':'Selected work apps','com.openai.chat':'Selected work apps'},'pauses':[(a,a+60000)]}
  rows,_=classify_capture([e,event(private=True)],afk(120),[event('com.openai.chat',seconds=180)],[],c,now=NOW)
  self.assertEqual(duration(rows),120)
  c['pauses']=[(a,None)]
  self.assertEqual(classify_capture([e],afk(),[],[],c,now=NOW),([],[]))
