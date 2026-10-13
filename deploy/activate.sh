#!/bin/sh
set -eu
# Validate without printing credentials or interpreting the secrets file as shell code.
python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
values={}
for line in Path('/etc/splot-time/secrets.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#'):
        k,sep,v=line.partition('=')
        if sep: values[k.strip()]=v.strip()
for name,prefix in [('SLACK_BOT_TOKEN','xoxb-'),('SLACK_APP_TOKEN','xapp-')]:
    if not values.get(name,'').startswith(prefix): raise SystemExit('Fill '+name+' in /etc/splot-time/secrets.env')
if not values.get('ADMIN_USER_IDS'): raise SystemExit('Fill ADMIN_USER_IDS')
u=urlsplit(values.get('COMPANION_PUBLIC_URL',''))
if u.scheme!='https' or not u.hostname or u.port not in (None,443) or u.username or u.query or u.fragment:
    raise SystemExit('Fill COMPANION_PUBLIC_URL with a root HTTPS address')
if any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789.-' for c in u.hostname): raise SystemExit('Invalid hostname')
base=u.path.rstrip('/')
if base and (not base.startswith('/') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-/' for c in base) or '//' in base):
    raise SystemExit('Invalid endpoint path')
# JSON is valid YAML, and avoids interpolating untrusted YAML fragments.
import json
route={'http':{'routers':{'splot-time':{'rule':'Host(`'+u.hostname+'`)','entryPoints':['https'],'service':'splot-time','tls':{'certResolver':'letsencrypt'},'middlewares':['splot-time-limit']},'splot-time-http':{'rule':'Host(`'+u.hostname+'`)','entryPoints':['http'],'service':'splot-time','middlewares':['splot-time-https']}},'services':{'splot-time':{'loadBalancer':{'servers':[{'url':'http://splot-time:5601'}]}}},'middlewares':{'splot-time-https':{'redirectScheme':{'scheme':'https','permanent':True}},'splot-time-limit':{'rateLimit':{'average':10,'burst':30}}}}}
if base:
    for router in route['http']['routers'].values():
        router['rule'] += ' && (Path(`'+base+'`) || PathPrefix(`'+base+'/`))'
        router['priority']=310
    route['http']['middlewares']['splot-time-prefix']={'stripPrefix':{'prefixes':[base]}}
    route['http']['routers']['splot-time']['middlewares'].append('splot-time-prefix')
p=Path('/data/coolify/proxy/dynamic/splot-time.yaml')
t=p.with_suffix('.pending');t.write_text(json.dumps(route));t.chmod(0o644);t.replace(p)
PY
docker compose -f /opt/splot-time/deploy/compose.yaml up -d --wait --wait-timeout 120
systemctl enable --now splot-time-backup.timer
