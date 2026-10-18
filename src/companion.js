import { setupPage } from './setup-page.js';
import { installScript, syncScript, OS_OF } from './install-script.js';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { workByDay, dayOf } from './classify.js';

const hash = s => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(24).toString('base64url');
const DAY = 86400000;
// Each sync re-reads this many past days, so a Mac that was closed for a while catches up.
export const LOOKBACK_DAYS = 7;

export function mergeIntervals(intervals) {
  const sorted = intervals.map(x => [x.start, x.end]).sort((a,b) => a[0]-b[0]);
  const out = [];
  for (const [start,end] of sorted) {
    if (out.length && start <= out.at(-1)[1]) out.at(-1)[1] = Math.max(end, out.at(-1)[1]);
    else out.push([start,end]);
  }
  return out;
}

/** First instant of the team day `days` days before today. */
function dayStart(now, days, timeZone) {
  const target = dayOf(now - days*DAY, timeZone);
  let lo = now - (days+2)*DAY, hi = now - (days-1)*DAY;
  while (hi - lo > 1) { const mid = Math.floor((lo+hi)/2); if (dayOf(mid,timeZone) < target) lo = mid; else hi = mid; }
  return hi;
}

/**
 * ActivityWatch query that returns window events clipped to not-idle time.
 * Window and idle buckets are paired by hostname; a Mac whose hostname changed
 * has several pairs and all of them are read. Buckets synced from other machines are ignored.
 */
export function activityQuery(buckets, start, end) {
  const list = Object.values(buckets && typeof buckets === 'object' ? buckets : {}).filter(b => typeof b?.id === 'string' && !b.id.includes('-synced-from-'));
  const afk = new Map(list.filter(b => b.id.startsWith('aw-watcher-afk_')).map(b => [b.hostname, b.id]));
  const pairs = list.filter(b => b.id.startsWith('aw-watcher-window_') && afk.has(b.hostname)).map(b => [b.id, afk.get(b.hostname)]);
  if (!pairs.length) return null;
  const query = pairs.map(([w,a],i) => `r${i} = filter_period_intersect(flood(query_bucket(${JSON.stringify(w)})), filter_keyvals(flood(query_bucket(${JSON.stringify(a)})), "status", ["not-afk"]));`);
  query.push(`RETURN = ${pairs.length === 1 ? 'r0' : `concat(${pairs.map((_,i) => 'r'+i).join(', ')})`};`);
  return { timeperiods: [`${new Date(start).toISOString()}/${new Date(end).toISOString()}`], query };
}

export function openCompanionStore(file, now = () => Date.now(), timeZone = process.env.TZ || 'Europe/Warsaw') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS companion_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, seen INTEGER, health TEXT, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS companion_snapshots (device_id TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device_id,day));
    DROP TABLE IF EXISTS companion_pairings;`);
  const columns = new Set(db.prepare('PRAGMA table_info(companion_devices)').all().map(c => c.name));
  for (const [name, type] of [['created','INTEGER'],['delivered','INTEGER'],['query_start','INTEGER'],['nudged','INTEGER NOT NULL DEFAULT 0']])
    if (!columns.has(name)) db.exec(`ALTER TABLE companion_devices ADD COLUMN ${name} ${type}`);

  const getDay = db.prepare('SELECT payload FROM companion_snapshots WHERE device_id=? AND day=?');
  const saveDay = db.prepare(`INSERT INTO companion_snapshots VALUES(?,?,1,?) ON CONFLICT(device_id,day) DO UPDATE SET revision=revision+1,payload=excluded.payload`);
  return {
    /** One Mac per person: connecting again replaces the previous one. */
    connect: db.transaction(userId => {
      db.prepare('UPDATE companion_devices SET revoked=1 WHERE user_id=?').run(userId);
      const id = secret(), token = secret();
      db.prepare('INSERT INTO companion_devices(id,user_id,token_hash,name,created) VALUES(?,?,?,?,?)').run(id,userId,hash(token),'Mac',now());
      return token;
    }),
    identity(token) { return db.prepare('SELECT * FROM companion_devices WHERE token_hash=? AND revoked=0').get(hash(token)); },
    query(device, buckets) {
      const t = now(), start = dayStart(t, LOOKBACK_DAYS, timeZone);
      const q = activityQuery(buckets, start, t + 3600000);
      db.prepare('UPDATE companion_devices SET query_start=?,seen=?,health=? WHERE id=?').run(q ? start : null, t, q ? 'reading' : 'no-activitywatch-data', device.id);
      return q;
    },
    /** Replaces every day the last query covered. Returns the days written. */
    ingest: db.transaction((device, result) => {
      const start = db.prepare('SELECT query_start FROM companion_devices WHERE id=?').get(device.id)?.query_start;
      if (!start || !Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0])) throw Error('Unexpected ActivityWatch result');
      const t = now(), byDay = workByDay(result[0], timeZone, t), days = [];
      // Half-day steps so a 23- or 25-hour daylight-saving day is never skipped.
      for (let ms = start, d = dayOf(ms, timeZone); d <= dayOf(t, timeZone); ms += DAY/2, d = dayOf(ms, timeZone)) {
        if (days.at(-1) === d) continue;
        days.push(d);
        const intervals = (byDay[d] ?? []).filter(x => x.start >= start);
        // A partial ActivityWatch result (a bucket deleted or renamed) must not erase a day already captured.
        if (!intervals.length && JSON.parse(getDay.get(device.id, d)?.payload ?? '[]').length) continue;
        saveDay.run(device.id, d, JSON.stringify(intervals));
      }
      db.prepare('UPDATE companion_devices SET seen=?,delivered=?,health=?,nudged=0 WHERE id=?').run(t,t,'ok',device.id);
      return days;
    }),
    devices(user) { return db.prepare('SELECT id,name,seen,delivered,health,created FROM companion_devices WHERE user_id=? AND revoked=0').all(user); },
    revoke(user) { db.prepare('UPDATE companion_devices SET revoked=1 WHERE user_id=?').run(user); },
    /** Connected Macs that have not delivered activity for `ms` and were not reminded yet. */
    silent(ms) { return db.prepare(`SELECT id,user_id,delivered,created,health FROM companion_devices WHERE revoked=0 AND nudged=0 AND COALESCE(delivered, created, 0) < ?`).all(now()-ms); },
    markNudged(id) { db.prepare('UPDATE companion_devices SET nudged=1 WHERE id=?').run(id); },
    suggestion(user, day) {
      const rows = db.prepare('SELECT s.payload FROM companion_snapshots s JOIN companion_devices d ON d.id=s.device_id WHERE d.user_id=? AND s.day=? AND d.revoked=0 ORDER BY d.id').all(user,day);
      const intervals = rows.flatMap(r=>JSON.parse(r.payload));
      const ms=mergeIntervals(intervals).reduce((n,[s,e])=>n+e-s,0);
      const projects=[...new Set(intervals.map(x=>x.project))];
      return {hours:Math.min(24,Math.round(ms/36000)/100), note:projects.join(', ').slice(0,300), revision:hash(JSON.stringify(rows)), present:rows.length>0};
    },
    close(){db.close();},
  };
}

const LIMITS = { '/v1/query': 1_000_000, '/v1/activity': 30_000_000 };

export function companionServer(store, allowed, {host='127.0.0.1',port=5601,publicUrl=process.env.COMPANION_PUBLIC_URL||'',onSnapshot=()=>{}}={}) {
  // No browser CORS. Only the Mac and Windows sync scripts talk to these endpoints; TLS is provided by the reverse proxy.
  const server=createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
    try {
      const path = new URL(req.url,'http://localhost').pathname;
      if (['GET','HEAD'].includes(req.method) && path === '/') {
        res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
        return res.end(req.method === 'HEAD' ? undefined : setupPage());
      }
      if (req.method==='GET' && ['/install.sh','/install.ps1'].includes(path)) {
        res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        return res.end(installScript(publicUrl, path.endsWith('.ps1') ? 'windows' : 'mac'));
      }
      if (req.method==='GET' && path.startsWith('/agent/') && OS_OF[path.slice(7)]) {
        res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        return res.end(syncScript(publicUrl, OS_OF[path.slice(7)]));
      }
      if(path==='/healthz' && req.method==='GET') return reply(200,{ok:true});
      if(req.method!=='POST' || !LIMITS[path]) return reply(404,{error:'Not found'});
      if(req.headers.origin || !String(req.headers['content-type']).startsWith('application/json')) return reply(403,{error:'Native JSON client required'});
      const device=store.identity(String(req.headers.authorization??'').replace(/^Bearer /,''));
      if(!device||!allowed(device.user_id)) return reply(401,{error:'Run /splot-time connect in Slack again'});
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length; if(size>LIMITS[path]) return reply(413,{error:'Payload too large'}); chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString());
      if(path==='/v1/query') {
        const q=store.query(device,body);
        return q ? reply(200,q) : reply(409,{error:'ActivityWatch has no window and idle data yet'});
      }
      const days=store.ingest(device,body);
      for(const day of days) await onSnapshot(device.user_id,day,store.suggestion(device.user_id,day));
      return reply(200,{accepted:true,days});
    }catch(error){reply(400,{error: error instanceof SyntaxError?'Invalid JSON':'Invalid request'});}
  });
  server.requestTimeout=120000; server.headersTimeout=10000;
  server.listen(port,host);
  return server;
}
