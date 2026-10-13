import argparse
import atexit
import signal
import datetime as dt
import http.server
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from zoneinfo import ZoneInfo
from privacy import public_status
from core import ActivityWatch, PROJECTS, Queue, json_request, summarize, split_days, classify_capture, website_rule, MIXED, PERSONAL

ROOT=Path(os.environ['SPLOT_TIME_DATA_DIR']) if os.environ.get('SPLOT_TIME_DATA_DIR') else Path.home()/'Library/Application Support/SplotTime'
ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(ROOT,0o700)
os.umask(0o077)
CONFIG=ROOT/'config.json'
LOCK=threading.RLock()
STATUS={'state':'starting','lastUpload':None,'pending':0,'apps':[], 'iphone':'not configured'}
LOCAL_TOKEN=secrets.token_urlsafe(32)
WAKE=threading.Event()


def config():
    if CONFIG.exists():
        c=json.loads(CONFIG.read_text())
        for k,v in {'siteRules':[],'decisions':{},'chromeBucket':''}.items():c.setdefault(k,v)
        return c
    return {'server':'','rules':{},'timezone':'Europe/Warsaw','pauses':[], 'phoneEnabled':False,'phoneDevice':'','siteRules':[],'decisions':{},'chromeBucket':'','policy':'splot-context-v1','automatic':True}


def save(c):
    tmp=ROOT/'config.tmp'
    tmp.write_text(json.dumps(c));tmp.replace(CONFIG)


def keychain(value=None):
    args=['/usr/bin/security']
    if value is None:
        p=subprocess.run(args+['find-generic-password','-s','com.splot.time.companion','-a','device','-w'],capture_output=True,text=True)
        return p.stdout.strip() if p.returncode==0 else ''
    p=subprocess.run(args+['add-generic-password','-U','-s','com.splot.time.companion','-a','device','-w',value],capture_output=True)
    if p.returncode:
        raise ValueError('Could not save pairing in macOS Keychain')


def launch_at_login(enabled):
    target=Path.home()/'Library/LaunchAgents/com.splot.time.companion.plist'
    import plistlib
    if enabled:
        if getattr(sys,'frozen',False) and 'Applications' not in Path(sys.executable).parts:
            raise ValueError('Move SplotTime to Applications before enabling startup')
        target.parent.mkdir(exist_ok=True)
        executable=sys.executable
        args=[executable,'--background'] if getattr(sys,'frozen',False) else [executable,str(Path(__file__).resolve()),'--background']
        with target.open('wb') as f:
            plistlib.dump({'Label':'com.splot.time.companion','ProgramArguments':args,'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':30,'ProcessType':'Background'},f)
        # bootstrap only after an explicit opt-in; launchd restarts the agent after a crash.
        subprocess.run(['/bin/launchctl','bootstrap',f'gui/{os.getuid()}',str(target)],capture_output=True)
    else:
        subprocess.run(['/bin/launchctl','bootout',f'gui/{os.getuid()}/com.splot.time.companion'],capture_output=True)
        target.unlink(missing_ok=True)


def collect(c):
    aw=ActivityWatch()
    buckets=aw.buckets()
    since=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=7)).isoformat()
    windows=[];afk=[];phones=[];devices=[];browser=[]
    chrome_buckets=[n for n in buckets if n.startswith('aw-watcher-web-chrome') and '-synced-from-' not in n]
    selected=c.get('chromeBucket') or (chrome_buckets[0] if len(chrome_buckets)==1 else '')
    if c.get('policy')=='splot-context-v1':
        for bucket in chrome_buckets:browser.extend(aw.events(bucket,since))
    elif selected in chrome_buckets:
        browser=aw.events(selected,since)
    phone_sources=[n for n in buckets if n.startswith('aw-import-screentime_ios_') and '-synced-from-' not in n]
    phone_device=c.get('phoneDevice') or (phone_sources[0] if len(phone_sources)==1 else '')
    for name,b in buckets.items():
        if '-synced-from-' in name:
            continue
        if name.startswith('aw-watcher-window_'):
            windows.extend(aw.events(name,since))
        elif name.startswith('aw-watcher-afk_'):
            afk.extend(aw.events(name,since))
        elif name.startswith('aw-import-screentime_ios_'):
            devices.append(name)
            if c.get('phoneEnabled') and name==phone_device:
                phones.extend(aw.events(name,since))
    # Capture only the local machine's matching AFK/window bucket pair.
    window_hosts={b.get('hostname') for n,b in buckets.items() if n.startswith('aw-watcher-window_') and '-synced-from-' not in n}
    afk_hosts={b.get('hostname') for n,b in buckets.items() if n.startswith('aw-watcher-afk_') and '-synced-from-' not in n}
    if len(window_hosts)!=1 or window_hosts!=afk_hosts:
        raise ValueError('Choose one local ActivityWatch device; ambiguous or missing idle data')
    apps=sorted({e['data'].get('app','') for e in windows+phones}-{''})
    now=time.time(); latest=max((dt.datetime.fromisoformat(e['timestamp'].replace('Z','+00:00')).timestamp()+e['duration'] for e in afk),default=0)
    if now-latest>600:
        raise ValueError('ActivityWatch idle watcher is stale; totals not uploaded')
    phone_last=max((dt.datetime.fromisoformat(e['timestamp'].replace('Z','+00:00')).timestamp()+e['duration'] for e in phones),default=0)
    phone_health='iphone-not-configured' if not c.get('phoneEnabled') else ('iphone-stale' if now-phone_last>86400 else 'ok')
    captured,review=classify_capture(windows,afk,phones,browser,c,now=now)
    browser_latest=max((dt.datetime.fromisoformat(e['timestamp'].replace('Z','+00:00')).timestamp()+e['duration'] for e in browser),default=0)
    native=any(e['data'].get('url') for e in windows if e['data'].get('app')=='Google Chrome')
    chrome_status=('Choose a Chrome source' if len(chrome_buckets)>1 and not selected else 'Chrome tab source connected' if browser_latest and now-browser_latest<600 else 'Chrome source found; no recent tab activity' if selected else 'Using URLs from the Mac watcher' if native else 'Waiting for Chrome tab data')
    if c.get('policy')=='splot-context-v1':chrome_status='Chrome website detection connected' if browser_latest and now-browser_latest<600 else 'Waiting for Chrome website data'
    with LOCK:
        STATUS.update(apps=apps,phoneDevices=devices,iphone=phone_health,chrome=chrome_status,chromeBuckets=chrome_buckets,review=[],reviewCount=0)
    return split_days(captured,c['timezone']),phone_health


def worker():
    q=Queue(ROOT/'queue.sqlite3')
    importer=None
    while True:
        try:
            with LOCK:c=config()
            if (c.get('automatic') or c.get('startAtLogin')) and time.time()-getattr(worker,'last_aw_start',0)>300:
                subprocess.run(['/usr/bin/open','-g','-a','ActivityWatch'],capture_output=True)
                worker.last_aw_start=time.time()
            if c.get('phoneEnabled') and (importer is None or importer.poll() is not None):
                executable=Path(sys.executable) if getattr(sys,'frozen',False) else Path(sys.executable).parent/'aw-import-screentime'
                if executable.exists():
                    device=c.get('phoneDevice','').removeprefix('aw-import-screentime_ios_ios-')
                    importer=subprocess.Popen([str(executable),*(['--import-iphone'] if getattr(sys,'frozen',False) else []),'watch',*(['--device',device] if device else [])],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    atexit.register(lambda process=importer: process.terminate() if process.poll() is None else None)
            if not c.get('phoneEnabled') and importer is not None:
                importer.terminate();importer=None
            capture_error=None
            paused=bool(c.get('pauses') and c['pauses'][-1][1] is None)
            today=dt.datetime.now(ZoneInfo(c['timezone'])).date()
            try:
                days,health=collect(c)
                for i in range(7):
                    day=(today-dt.timedelta(days=i)).isoformat()
                    q.put(day,days.get(day,[]),'paused' if paused else health)
            except Exception as e:
                capture_error=e
            q.device(c.get('deviceId',''))
            token=keychain()
            if c.get('server') and token:
                send=lambda payload:json_request(c['server']+'/v1/snapshot',payload,token)
                q.flush(send)
                # Heartbeat uses the same idempotent revision, even on quiet days.
                row=q.db.execute('SELECT revision,payload FROM queue WHERE day=?',(today.isoformat(),)).fetchone()
                if row and not capture_error:
                    send({'day':today.isoformat(),'revision':row[0],**json.loads(row[1])})
                with LOCK:STATUS['lastUpload']=time.time()
            if capture_error:
                raise capture_error
            with LOCK:STATUS.update(state='paused' if paused else 'running' if token else 'pairing required',pending=q.pending())
        except Exception as e:
            with LOCK:STATUS.update(state='needs attention',error='Capture or connection needs attention.',pending=q.pending())
        WAKE.wait(60);WAKE.clear()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,body,ctype='application/json'):
        raw=(json.dumps(body) if ctype=='application/json' else body).encode()
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.path=='/':
            return self.reply(200,(Path(__file__).parent/'index.html').read_text(),'text/html; charset=utf-8')
        if self.headers.get('Authorization')!='Bearer '+LOCAL_TOKEN:return self.reply(403,{'error':'Open SplotTime from Applications'})
        with LOCK:
            c=config(); status=dict(STATUS)
        if self.path=='/status':return self.reply(200,public_status(c,status))
        return self.reply(404,{})
    def do_POST(self):
        if self.headers.get('Authorization')!='Bearer '+LOCAL_TOKEN:return self.reply(403,{})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length>20000:raise ValueError('Request too large')
            b=json.loads(self.rfile.read(length))
            with LOCK:
                c=config()
                if self.path=='/pair':
                    url=b['server'].rstrip('/');u=urllib.parse.urlparse(url)
                    if u.scheme!='https' or not u.hostname or u.username or u.query or u.fragment:raise ValueError('Use the team HTTPS server address')
                    result=json_request(url+'/v1/pair',{'code':b['code'],'name':'SplotTime Mac'})
                    keychain(result['token']);c['server']=url;c['deviceId']=result['id'];c.update(automatic=True,policy='splot-context-v1');save(c)
                    launch_at_login(True);c['startAtLogin']=True;save(c)
                elif self.path=='/automatic':
                    launch_at_login(True)
                    c.update(automatic=True,startAtLogin=True,policy='splot-context-v1')
                    for app in ['Google Chrome','Safari','ChatGPT','Slack','Code','com.google.Chrome','com.apple.mobilesafari','com.openai.chat','com.tinyspeck.chatlyio']:
                        c.setdefault('rules',{}).setdefault(app,'Selected work apps')
                    save(c)
                elif self.path=='/phone':
                    if type(b.get('enabled')) is not bool:raise ValueError('Invalid phone setting')
                    c['phoneEnabled']=b['enabled'];save(c)
                elif self.path=='/settings':
                    ZoneInfo(b['timezone'])
                    rules=b['rules']
                    if not isinstance(rules,dict) or any(not isinstance(a,str) or len(a)>200 or p not in PROJECTS+[MIXED,PERSONAL] for a,p in rules.items()):raise ValueError('Invalid rules')
                    site_rules=b.get('siteRules',c.get('siteRules',[]))
                    if not isinstance(site_rules,list) or len(site_rules)>200:raise ValueError('Too many website rules')
                    checked=[];seen=set()
                    for rule in site_rules:
                        host,path=website_rule(rule['website'])
                        project=rule['project']
                        if project not in PROJECTS+[MIXED,PERSONAL]:raise ValueError('Choose a project, mixed or personal')
                        if (host,path) in seen:raise ValueError('A website path can only have one rule')
                        seen.add((host,path));checked.append({'host':host,'path':path,'website':host+('' if path=='/' else path),'project':project})
                    chrome_bucket=b.get('chromeBucket','')
                    if chrome_bucket and chrome_bucket not in STATUS.get('chromeBuckets',[]):raise ValueError('Choose an available Chrome source')
                    c.update(siteRules=checked,chromeBucket=chrome_bucket)
                    c.update(rules=rules,timezone=b['timezone'],phoneEnabled=bool(b.get('phoneEnabled')),phoneDevice=b.get('phoneDevice',''))
                    save(c)
                elif self.path=='/review':
                    choices=b.get('choices',{})
                    valid={r['id'] for r in STATUS.get('review',[])}
                    if not isinstance(choices,dict) or len(choices)>150:raise ValueError('Invalid review')
                    if any(k not in valid or v not in PROJECTS+[PERSONAL] for k,v in choices.items()):raise ValueError('Refresh the review list and choose a project or personal')
                    c.setdefault('decisions',{}).update(choices);save(c)
                    STATUS['review']=[r for r in STATUS.get('review',[]) if r['id'] not in choices]
                    STATUS['reviewCount']=max(0,STATUS.get('reviewCount',0)-len(choices))
                elif self.path=='/pause':
                    now=int(time.time()*1000)
                    if c['pauses'] and c['pauses'][-1][1] is None:c['pauses'][-1][1]=now
                    else:c['pauses'].append([now,None])
                    save(c)
                elif self.path=='/login':
                    c['startAtLogin']=bool(b['enabled']);save(c);launch_at_login(c['startAtLogin'])
                elif self.path=='/start-aw':
                    if subprocess.run(['/usr/bin/open','-g','-a','ActivityWatch'],capture_output=True).returncode:
                        raise ValueError('Install ActivityWatch in Applications first')
                else:return self.reply(404,{})
            WAKE.set()
            self.reply(200,{'ok':True})
        except Exception:self.reply(400,{'error':'Could not complete setup. Check permissions and your connection. For pairing, request a fresh Slack code and retry.'})


def main():
    signal.signal(signal.SIGTERM,lambda *_: sys.exit(0))
    parser=argparse.ArgumentParser();parser.add_argument('--background',action='store_true');args=parser.parse_args()
    import fcntl
    lock=(ROOT/'instance.lock').open('w')
    # A launchd replacement waits for the foreground setup process to exit.
    # This transfers ownership after a crash without duplicate capture processes.
    try:fcntl.flock(lock,fcntl.LOCK_EX if args.background else fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        if not args.background and not config().get('deviceId') and (ROOT/'local-url').exists():webbrowser.open((ROOT/'local-url').read_text())
        return
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    url=f'http://127.0.0.1:{server.server_port}/#{LOCAL_TOKEN}'
    (ROOT/'local-url').write_text(url)
    threading.Thread(target=worker,daemon=True).start()
    if not args.background and not config().get('deviceId'):webbrowser.open(url)
    try:server.serve_forever()
    finally:server.server_close()

if __name__=='__main__':main()
