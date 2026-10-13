"""Local capture and durable delivery. Raw ActivityWatch events never leave this process."""
import datetime as dt
from bisect import bisect_left, bisect_right
import hashlib
import json
import re
import sqlite3
import ssl
import sys
import time
import urllib.request
import urllib.parse
from zoneinfo import ZoneInfo

PROJECTS = ['Product & Engineering', 'Sales & Partnerships', 'Sourcing & Production', 'Marketing & Content', 'Operations & Admin', 'Selected work apps']


def merge(intervals):
    out = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if out and start <= out[-1][1]:
            out[-1][1] = max(end, out[-1][1])
        else:
            out.append([start, end])
    return out


def intersect(left, right):
    out = []
    a, b = merge(left), merge(right)
    i = j = 0
    while i < len(a) and j < len(b):
        start, end = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if end > start:
            out.append([start, end])
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def span(event):
    start = dt.datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp()
    return [int(start * 1000), int((start + max(0, float(event['duration']))) * 1000)]


def summarize(windows, afk, phones, rules, pauses, now=None):
    """Phone time is not intersected with Mac idle state. Unknown apps are excluded."""
    now = int((time.time() if now is None else now) * 1000)
    active = [span(e) for e in afk if e['data'].get('status') == 'not-afk']
    out = []
    for events, is_phone in [(windows, False), (phones, True)]:
        for e in events:
            project = rules.get(e['data'].get('app'))
            if project not in PROJECTS:
                continue
            start, end = span(e)
            end = min(end, now)
            parts = [[start, end]] if is_phone else intersect([[start, end]], active)
            for pstart, pend in pauses:
                parts = [part for a,b in parts for part in
                         ([[a,b]] if pend <= a or pstart >= b else
                          ([[a,pstart]] if a < pstart else []) + ([[pend,b]] if pend < b else []))]
            out.extend({'start':a, 'end':b, 'project':project} for a,b in parts if b > a)
    # Collapse adjacent same-project intervals before upload to keep payloads bounded.
    return [{'start':a,'end':b,'project':p} for p in PROJECTS
            for a,b in merge([[e['start'],e['end']] for e in out if e['project']==p])]


def split_days(intervals, timezone):
    tz = ZoneInfo(timezone)
    days = {}
    for e in intervals:
        start = e['start']
        while start < e['end']:
            local = dt.datetime.fromtimestamp(start/1000, tz)
            tomorrow = dt.datetime.combine(local.date()+dt.timedelta(days=1),dt.time(),tz)
            end = min(e['end'], round(tomorrow.timestamp()*1000))
            days.setdefault(local.date().isoformat(), []).append({**e,'start':start,'end':end})
            start = end
    return days


def json_request(url, body=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer '+token
    request = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    # Never forward device credentials through HTTP redirects.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError('Redirects are not accepted')
    handlers=[NoRedirect()]
    if getattr(sys,'frozen',False) and url.startswith('https:'):
        import certifi
        handlers.append(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
    opener = urllib.request.build_opener(*handlers)
    with opener.open(request, timeout=15) as response:
        return json.load(response)


class Queue:
    def __init__(self, path):
        self.db=sqlite3.connect(path)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS queue(day TEXT PRIMARY KEY, revision INTEGER, payload TEXT, sent INTEGER DEFAULT 0)')
        self.db.commit()

    def device(self, device_id):
        self.db.execute('CREATE TABLE IF NOT EXISTS identity(id TEXT)')
        current=self.db.execute('SELECT id FROM identity').fetchone()
        if current is None or current[0]!=device_id:
            with self.db:
                self.db.execute('DELETE FROM identity')
                self.db.execute('INSERT INTO identity VALUES(?)',(device_id,))
                self.db.execute('UPDATE queue SET sent=0')

    def put(self, day, intervals, health):
        payload=json.dumps({'intervals':intervals,'health':health},sort_keys=True)
        old=self.db.execute('SELECT revision,payload FROM queue WHERE day=?',(day,)).fetchone()
        if old and old[1]==payload:
            return
        revision=old[0]+1 if old else 1
        with self.db:
            self.db.execute('INSERT INTO queue VALUES(?,?,?,0) ON CONFLICT(day) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,sent=0',(day,revision,payload))

    def flush(self, send):
        for day,revision,payload in self.db.execute('SELECT day,revision,payload FROM queue WHERE sent=0 ORDER BY day').fetchall():
            result=send({'day':day,'revision':revision,**json.loads(payload)})
            if not result.get('accepted') or result.get('revision',0)<revision:
                raise ValueError('Server did not acknowledge snapshot')
            with self.db:
                self.db.execute('UPDATE queue SET sent=1 WHERE day=? AND revision=?',(day,revision))

    def pending(self):
        return self.db.execute('SELECT COUNT(*) FROM queue WHERE sent=0').fetchone()[0]


class ActivityWatch:
    def __init__(self, base='http://127.0.0.1:5600/api/0'):
        self.base=base

    def buckets(self):
        return json_request(self.base+'/buckets/')

    def events(self, bucket, start):
        # Both ActivityWatch servers support limit/start, but not offset pagination.
        query=urllib.parse.urlencode({'start':start,'limit':100001})
        rows=json_request(self.base+'/buckets/'+urllib.parse.quote(bucket,safe='')+'/events?'+query)
        if not isinstance(rows,list):
            raise ValueError('Invalid ActivityWatch response')
        if len(rows)>100000:
            raise ValueError('ActivityWatch result limit exceeded; no partial totals uploaded')
        return rows

CHROME_APPS = {'Google Chrome', 'Google Chrome Beta', 'Google Chrome Canary', 'chrome', 'chrome.exe', 'google-chrome'}
PERSONAL = 'personal'
MIXED = 'mixed'


def website_rule(value):
    """Exact host and optional path prefix. Queries and fragments never become rules."""
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError('Enter a website, optionally with a path')
    u = urllib.parse.urlsplit(value if '://' in value else 'https://' + value)
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.port:
        raise ValueError('Use a website such as github.com or github.com/your-team')
    host = u.hostname.lower().encode('idna').decode('ascii')
    if any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in host):
        raise ValueError('Invalid website')
    return host, u.path.rstrip('/') or '/'


def site_project(url, rules):
    try:
        u = urllib.parse.urlsplit(url)
        if u.scheme not in ('http', 'https') or not u.hostname:
            return MIXED
        host = u.hostname.lower().encode('idna').decode('ascii')
        path = u.path or '/'
    except (ValueError, UnicodeError):
        return MIXED
    matches = [r for r in rules if r['host'] == host and
               (r['path'] == '/' or path == r['path'] or path.startswith(r['path'] + '/'))]
    return max(matches, key=lambda r: len(r['path']))['project'] if matches else MIXED


def without_pauses(parts, pauses):
    for pstart, pend in pauses:
        parts = [part for a,b in parts for part in
                 ([[a,b]] if pend <= a or pstart >= b else
                  ([[a,pstart]] if a < pstart else []) + ([[pend,b]] if pend < b else []))]
    return parts


def session_key(event, source):
    data=event['data']
    value=[source,event['timestamp'],data.get('app',''),data.get('title',''),data.get('url','')]
    return hashlib.sha256(json.dumps(value,ensure_ascii=True).encode()).hexdigest()


def classify_capture(windows, afk, phones, browser, config, now=None):
    """Classify locally; only the intervals output is eligible for upload."""
    if config.get('policy') in ('splot-defaults-v1','splot-context-v1'):
        return default_capture(windows,afk,phones,browser,config,now),[]
    if config.get('automatic'):
        # This mode deliberately counts all active use of selected apps, regardless of topic.
        rules=config.get('rules',{})
        windows=[e for e in windows if not e['data'].get('incognito') and not e['data'].get('private')]
        phones=[e for e in phones if not e['data'].get('incognito') and not e['data'].get('private')]
        cutoff=int((time.time() if now is None else now)*1000)
        pauses=[(a,b if b is not None else cutoff) for a,b in config.get('pauses',[])]
        return summarize(windows,afk,phones,rules,pauses,now=now),[]
    cutoff=int((time.time() if now is None else now)*1000)
    active=merge([span(e) for e in afk if e['data'].get('status') == 'not-afk'])
    active_starts=[a for a,b in active];active_ends=[b for a,b in active]
    browser=sorted(browser,key=lambda e:span(e)[0])
    tab_starts=[];tab_max_ends=[]
    for tab in browser:
        a,b=span(tab);tab_starts.append(a);tab_max_ends.append(max(b,tab_max_ends[-1] if tab_max_ends else b))
    pauses=[(a,b or cutoff) for a,b in config.get('pauses',[])]
    rules=config.get('rules',{})
    decisions=config.get('decisions',{})
    sites=config.get('siteRules',[])
    intervals=[];pending={}

    def record(event, source, parts, project):
        data=event['data']
        if data.get('incognito') or data.get('private'):
            return
        parts=without_pauses([[a,min(b,cutoff)] for a,b in parts if min(b,cutoff)>a],pauses)
        if not parts:
            return
        key=session_key(event,source)
        # Explicit personal rules win over old session decisions.
        if project != PERSONAL:
            project=decisions.get(key,project)
        if project in PROJECTS:
            intervals.extend({'start':a,'end':b,'project':project} for a,b in parts)
        elif project != PERSONAL:
            row=pending.setdefault(key,{'id':key,'app':data.get('app','iPhone'),'title':data.get('title',''),
                                       'site':urllib.parse.urlsplit(data.get('url','')).hostname or '',
                                       'start':parts[0][0], 'parts':[]})
            row['parts'].extend(parts)

    for e in windows:
        app=e['data'].get('app','')
        start,end=span(e)
        live=intersect([[start,end]],active[bisect_right(active_ends,start):bisect_left(active_starts,end)])
        if not live:
            continue
        if app not in CHROME_APPS:
            record(e,'mac',live,rules.get(app,MIXED))
            continue
        # Extension events are clipped to the foreground Chrome window and idle state.
        # Match titles where available to avoid attributing a different profile's tab.
        covered=[]
        for tab in browser[bisect_right(tab_max_ends,start):bisect_left(tab_starts,end)]:
            title=e['data'].get('title','').removesuffix(' - Google Chrome')
            tab_title=tab['data'].get('title','')
            if title and tab_title and title != tab_title:
                continue
            parts=intersect(live,[span(tab)])
            if not parts:
                continue
            covered.extend(parts)
            merged={**tab,'data':{**tab['data'],'app':app}}
            record(merged,'chrome',parts,site_project(tab['data'].get('url',''),sites))
        # Native URL capture is useful when available; missing URL stays reviewable.
        remaining=without_pauses(live,merge(covered))
        project=site_project(e['data'].get('url',''),sites)
        record(e,'mac',remaining,project)
    for e in phones:
        record(e,'iphone',[span(e)],rules.get(e['data'].get('app',''),MIXED))
    compact=[{'start':a,'end':b,'project':p} for p in PROJECTS
             for a,b in merge([[e['start'],e['end']] for e in intervals if e['project']==p])]
    review=[]
    for row in pending.values():
        row['seconds']=sum(b-a for a,b in merge(row.pop('parts')))/1000
        review.append(row)
    return compact,sorted(review,key=lambda r:r['start'],reverse=True)


BROWSER_APPS = CHROME_APPS | {'Safari','Firefox','Microsoft Edge','Arc','Brave Browser','com.apple.mobilesafari','com.google.chrome.ios','com.google.Chrome'}
BLOCKED_DOMAINS = ('youtube.com','youtu.be','youtube-nocookie.com','facebook.com','fb.watch')
BUSINESS_DOMAINS = ('business.facebook.com','adsmanager.facebook.com')
SYSTEM_APPS = {'Finder','System Settings','System Preferences','SystemUIServer','Control Center','Notification Center','UserNotificationCenter','coreautha','loginwindow','Dock','Window Server','Spotlight','SecurityAgent','SplotTime'}

def domain_is(host,domain):
    return host==domain or host.endswith('.'+domain)

def default_website(url):
    try:
        u=urllib.parse.urlsplit(url)
        host=(u.hostname or '').lower().rstrip('.')
        if u.scheme not in ('http','https') or not host:return PERSONAL
    except ValueError:return PERSONAL
    if any(domain_is(host,d) for d in BUSINESS_DOMAINS):return 'Selected work apps'
    return PERSONAL if any(domain_is(host,d) for d in BLOCKED_DOMAINS) else 'Selected work apps'

def default_capture(windows,afk,phones,browser,config,now=None):
    """Fixed team policy. Missing browser URLs cannot bypass website exclusions."""
    cutoff=int((time.time() if now is None else now)*1000)
    active=merge([span(e) for e in afk if e['data'].get('status')=='not-afk'])
    pauses=[(a,b if b is not None else cutoff) for a,b in config.get('pauses',[])]
    out=[]
    smart=config.get('policy')=='splot-context-v1'
    def website(data):return context_project(data,browser=True) if smart else default_website(data.get('url',''))
    def add(e,parts,project):
        if project==PERSONAL or e['data'].get('incognito') or e['data'].get('private'):return
        out.extend(without_pauses([[a,min(b,cutoff)] for a,b in parts if min(b,cutoff)>a],pauses))
    tabs=sorted(browser,key=lambda e:span(e)[0]);starts=[];ends=[]
    for t in tabs:
        a,b=span(t);starts.append(a);ends.append(max(b,ends[-1] if ends else b))
    for e in windows:
        data=e['data'];app=data.get('app','');a,b=span(e)
        if not app or app in SYSTEM_APPS or app.lower() in {'youtube','facebook'}:continue
        parts=intersect([[a,b]],active)
        if app not in BROWSER_APPS:
            add(e,parts,context_project(data) if smart else 'Selected work apps');continue
        if app not in CHROME_APPS or data.get('url'):
            add(e,parts,website(data));continue
        title=data.get('title','').removesuffix(' - Google Chrome')
        candidates=[t for t in tabs[bisect_right(ends,a):bisect_left(starts,b)] if title and t['data'].get('title')==title]
        # Conflicting profiles fail closed: excluded/private spans win.
        denied=[];allowed=[]
        for t in candidates:
            segments=intersect(parts,[span(t)])
            if t['data'].get('incognito') or t['data'].get('private') or website(t['data'])==PERSONAL:denied.extend(segments)
            else:allowed.extend(segments)
        add(e,without_pauses(merge(allowed),merge(denied)),'Selected work apps')
    for e in phones:
        app=e['data'].get('app','')
        if not app or app in SYSTEM_APPS or app.lower() in {'youtube','facebook','com.google.ios.youtube','com.facebook.facebook'}:continue
        project=context_project(e['data'],browser=app in BROWSER_APPS,phone=True) if smart else default_website(e['data'].get('url','')) if app in BROWSER_APPS else 'Selected work apps'
        add(e,[span(e)],project)
    return [{'start':a,'end':b,'project':'Selected work apps'} for a,b in merge(out)]


# Local, explainable context rules. Unrecognised topics abstain instead of filling a review queue.
WORK_APPS = {'Code','Visual Studio Code','Cursor','Xcode','IntelliJ IDEA','PyCharm','WebStorm','Figma','Linear','Slack','Terminal','iTerm2','Warp','Postman','Docker Desktop','com.tinyspeck.chatlyio'}
WORK_HOSTS = ('crm.usesplot.com','usesplot.com','linear.app','figma.com','github.com','gitlab.com','stackoverflow.com','developer.mozilla.org','docs.python.org','docs.google.com','business.facebook.com','adsmanager.facebook.com','business.instagram.com','canva.com')
PERSONAL_CONTEXT = re.compile(r'\b(recipe|recipes|cooking|workout|fitness|dating|netflix|minecraft|fortnite|gameplay|gaming|horoscope|vacation|holiday itinerary|meal plan|przepis|przepisy|trening|wakacje|randki)\b',re.I)
WORK_CONTEXT = re.compile(r'\b(splot|usesplot|supplier|suppliers|sourcing|textile|textiles|fabric|fabrics|garment|garments|production order|purchase order|invoice|invoices|client proposal|client brief|rfq|wholesale|screen printing|embroidery|sewing|pattern making|tech pack|marketing|content calendar|ad campaign|ads manager|business suite|conversion tracking|meta pixel|analytics|seo|ecommerce|e-commerce|shopify|typescript|javascript|python|react|next[ .]?js|api|debugging|programming|software development|pull request|database|docker|kubernetes|dostawca|dostawcy|tkanina|tkaniny|dzianina|dzianiny|szwalnia|produkcja|faktura|faktury|kampania|reklama|reklamy)\b',re.I)

def context_project(data,browser=False,phone=False):
    if data.get('private') or data.get('incognito'):return PERSONAL
    app=data.get('app','')
    if app in SYSTEM_APPS:return PERSONAL
    title=data.get('title','')
    try:
        url=urllib.parse.urlsplit(data.get('url',''))
        host=(url.hostname or '').lower().rstrip('.')
        context=' '.join([title,urllib.parse.unquote(url.path),urllib.parse.unquote(url.query)])
    except ValueError:return PERSONAL
    if PERSONAL_CONTEXT.search(context):return PERSONAL
    if WORK_CONTEXT.search(context):return 'Selected work apps'
    if browser:
        if url.scheme not in ('http','https') or not host:return PERSONAL
        return 'Selected work apps' if any(domain_is(host,h) for h in WORK_HOSTS) else PERSONAL
    # iPhone mixed apps expose only a bundle ID, not the conversation/account.
    if phone:return 'Selected work apps' if app in WORK_APPS else PERSONAL
    return 'Selected work apps' if app in WORK_APPS else PERSONAL
