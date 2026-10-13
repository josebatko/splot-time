import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
from core import classify_capture, website_rule, site_project, PROJECTS, span
NOW=2000000000

def event(app='Google Chrome',minute=0,seconds=600,**data):
    return {'timestamp':f'2026-10-12T10:{minute:02d}:00Z','duration':seconds,'data':{'app':app,**data}}

def afk(seconds=600):return [event(seconds=seconds,status='not-afk')]
def rule(website,project):
    host,path=website_rule(website);return {'host':host,'path':path,'website':website,'project':project}
def duration(rows):return sum(r['end']-r['start'] for r in rows)/1000

class ContextTests(unittest.TestCase):
    def test_same_app_can_be_personal_or_different_work_projects(self):
        win=[event()];tabs=[event(seconds=120,url='https://work.test/a'),event(minute=2,seconds=120,url='https://work.test/b'),event(minute=4,seconds=120,url='https://personal.test/')]
        c={'siteRules':[rule('work.test/a',PROJECTS[0]),rule('work.test/b',PROJECTS[1]),rule('personal.test','personal')]}
        rows,pending=classify_capture(win,afk(),[],tabs,c,now=NOW)
        self.assertEqual(duration(rows),240);self.assertEqual({r['project'] for r in rows},set(PROJECTS[:2]))
        self.assertEqual(sum(r['seconds'] for r in pending),240)
    def test_background_tabs_idle_and_private_events_never_count(self):
        tab=event(url='https://work.test',incognito=True)
        c={'siteRules':[rule('work.test',PROJECTS[0])]}
        self.assertEqual(classify_capture([event(url='https://work.test')],afk(),[],[tab],c,now=NOW),([],[]))
        self.assertEqual(classify_capture([event('Code')],afk(),[],[event(url='https://work.test')],c,now=NOW)[0],[])
        rows,_=classify_capture([event()],afk(30),[],[event(url='https://work.test')],c,now=NOW)
        self.assertEqual(duration(rows),30)
    def test_website_rules_are_exact_host_and_path_boundaries(self):
        rules=[rule('work.test',PROJECTS[0]),rule('work.test/personal','personal')]
        self.assertEqual(site_project('https://work.test/personal/docs?secret=x',rules),'personal')
        self.assertEqual(site_project('https://work.test/personality',rules),PROJECTS[0])
        for url in ['https://work.test.evil.org','https://other.work.test','chrome://settings']:
            self.assertEqual(site_project(url,rules),'mixed')
        self.assertEqual(website_rule('HTTPS://WORK.TEST/team?secret=x#private'),('work.test','/team'))
        with self.assertRaises(ValueError):website_rule('https://user:password@work.test')
    def test_mixed_session_can_be_reviewed_without_uploading_raw_context(self):
        win=[event('ChatGPT',title='A private conversation')]
        c={'rules':{'ChatGPT':'mixed'}}
        rows,pending=classify_capture(win,afk(),[],[],c,now=NOW)
        self.assertEqual(rows,[]);self.assertEqual(len(pending),1)
        c['decisions']={pending[0]['id']:PROJECTS[0]}
        rows,pending=classify_capture(win,afk(),[],[],c,now=NOW)
        self.assertEqual(duration(rows),600);self.assertEqual(pending,[])
        self.assertEqual(set(rows[0]),{'start','end','project'})
        c['rules']['ChatGPT']='personal'
        self.assertEqual(classify_capture(win,afk(),[],[],c,now=NOW),([],[]))
    def test_chrome_does_not_fall_back_to_whole_app_work_rule(self):
        rows,pending=classify_capture([event()],afk(),[],[],{'rules':{'Google Chrome':PROJECTS[0]}},now=NOW)
        self.assertEqual(rows,[]);self.assertEqual(len(pending),1)
    def test_other_profile_title_mismatch_is_not_attributed(self):
        rows,pending=classify_capture([event(title='Personal page')],afk(),[],[event(title='Company dashboard',url='https://work.test')],{'siteRules':[rule('work.test',PROJECTS[0])]},now=NOW)
        self.assertEqual(rows,[]);self.assertEqual(len(pending),1)
    def test_native_urls_pause_and_phone_are_handled(self):
        win=event(url='https://work.test');a,b=span(win)
        c={'siteRules':[rule('work.test',PROJECTS[0])],'pauses':[(a,a+60000)],'rules':{'Slack':PROJECTS[1]}}
        rows,_=classify_capture([win],afk(180),[event('Slack',minute=5,seconds=60)],[],c,now=NOW)
        self.assertEqual(duration(rows),180)

if __name__=='__main__':unittest.main()
