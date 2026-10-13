import unittest
from test_context import event,afk,duration,NOW
from core import classify_capture,default_website
class DefaultsTests(unittest.TestCase):
 def run_capture(self,windows,tabs=(),phones=(),active=600):
  return classify_capture(windows,afk(active),phones,tabs,{'policy':'splot-defaults-v1'},now=NOW)
 def test_domain_exclusions_and_business_exceptions(self):
  for host in ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','youtube-nocookie.com','facebook.com','www.facebook.com','m.facebook.com','fb.watch']:
   self.assertEqual(default_website('https://'+host+'/anything'),'personal')
  for url in ['https://business.facebook.com/latest/home','https://adsmanager.facebook.com','https://instagram.com/usesplot','https://chatgpt.com','https://example.org','https://facebook.com.example.org']:
   self.assertEqual(default_website(url),'Selected work apps')
  self.assertEqual(default_website(''),'personal')
 def test_unknown_browser_time_does_not_bypass_exclusions(self):
  self.assertEqual(self.run_capture([event()]),([],[]))
  rows,review=self.run_capture([event(title='Active')],[event(title='Active',url='https://youtube.com')])
  self.assertEqual(rows,[]);self.assertEqual(review,[])
 def test_browser_foreground_idle_private_and_conflicting_profiles(self):
  win=[event(title='Active')];allowed=event(title='Active',url='https://instagram.com/usesplot')
  rows,_=self.run_capture(win,[allowed],active=120);self.assertEqual(duration(rows),120)
  rows,_=self.run_capture(win,[allowed,event(title='Active',url='https://facebook.com')]);self.assertEqual(rows,[])
  rows,_=self.run_capture(win,[event(title='Other',url='https://chatgpt.com')]);self.assertEqual(rows,[])
  rows,_=self.run_capture(win,[event(title='Active',url='https://chatgpt.com',incognito=True)]);self.assertEqual(rows,[])
 def test_safari_chatgpt_system_screens_and_phone(self):
  self.assertEqual(duration(self.run_capture([event('ChatGPT')])[0]),600)
  self.assertEqual(self.run_capture([event('Finder')]),([],[]))
  self.assertEqual(self.run_capture([event('Safari',url='https://youtube.com')]),([],[]))
  self.assertEqual(duration(self.run_capture([event('Safari',url='https://business.facebook.com')])[0]),600)
  self.assertEqual(self.run_capture([],phones=[event('com.apple.mobilesafari')]),([],[]))
  self.assertEqual(duration(self.run_capture([],phones=[event('com.openai.chat')])[0]),600)
