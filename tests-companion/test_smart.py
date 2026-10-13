import unittest
from test_context import event,afk,duration,NOW
from core import classify_capture,context_project
class SmartTests(unittest.TestCase):
 def classify(self,app='Google Chrome',title='',url='',phone=False):
  return context_project({'app':app,'title':title,'url':url},browser=app in ['Google Chrome','Safari'],phone=phone)
 def test_work_videos_and_facebook_context_count_without_whitelisting_all_social(self):
  for title,url in [('How to debug a React API','https://www.youtube.com/watch?v=1'),('SPLOT new collection','https://www.facebook.com/usesplot'),('','https://www.instagram.com/usesplot/'),('','https://business.facebook.com/latest/home')]:
   self.assertEqual(self.classify(title=title,url=url),'Selected work apps')
  for title,url in [('Best football goals','https://youtube.com/watch?v=1'),('My friends','https://facebook.com'),('Trending reels','https://instagram.com')]:
   self.assertEqual(self.classify(title=title,url=url),'personal')
 def test_chatgpt_context_and_uncertain_topic(self):
  self.assertEqual(self.classify('ChatGPT','SPLOT supplier comparison'),'Selected work apps')
  for title in ['Dinner recipes','New chat','Holiday itinerary','Gaming API for Minecraft']:
   self.assertEqual(self.classify('ChatGPT',title),'personal')
 def test_phone_mixed_context_not_invented(self):
  self.assertEqual(self.classify('com.openai.chat',phone=True),'personal')
  self.assertEqual(self.classify('com.burbn.instagram',phone=True),'personal')
  self.assertEqual(self.classify('com.tinyspeck.chatlyio',phone=True),'Selected work apps')
 def test_capture_idle_overlap_private_no_raw_fields(self):
  windows=[event(title='React tutorial')];tabs=[event(title='React tutorial',url='https://youtube.com/watch?v=1')]
  config={'policy':'splot-context-v1'}
  rows,review=classify_capture(windows,afk(120),[],tabs,config,now=NOW)
  self.assertEqual(duration(rows),120);self.assertEqual(review,[]);self.assertEqual(set(rows[0]),{'start','end','project'})
  tabs[0]['data']['private']=True
  self.assertEqual(classify_capture(windows,afk(),[],tabs,config,now=NOW),([],[]))
 def test_host_boundaries_and_personal_title_override(self):
  self.assertEqual(self.classify(url='https://github.com.evil.test'),'personal')
  self.assertEqual(self.classify(title='Dinner recipes',url='https://docs.google.com/document/1'),'personal')
