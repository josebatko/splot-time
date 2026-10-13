import { setupPage } from './setup-page.js';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { isValidDate } from './periods.js';

const hash = s => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(24).toString('base64url');
export const PROJECTS = ['Product & Engineering', 'Sales & Partnerships', 'Sourcing & Production', 'Marketing & Content', 'Operations & Admin', 'Selected work apps'];
export function mergeIntervals(intervals) {
  const sorted = intervals.map(x => [x.start, x.end]).sort((a,b) => a[0]-b[0]);
  const out = [];
  for (const [start,end] of sorted) {
    if (out.length && start <= out.at(-1)[1]) out.at(-1)[1] = Math.max(end, out.at(-1)[1]);
    else out.push([start,end]);
  }
  return out;
}
export function validateSnapshot(body, now = Date.now(), timezone = process.env.TZ || 'Europe/Warsaw') {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  if (!body || Object.keys(body).some(k => !['day','revision','intervals','health'].includes(k))) throw Error('Unexpected fields');
  if (!isValidDate(body.day) || !Number.isSafeInteger(body.revision) || body.revision < 1) throw Error('Invalid day or revision');
  if (!Array.isArray(body.intervals) || body.intervals.length > 3000) throw Error('Too many intervals');
  const lower = Date.parse(body.day + 'T00:00:00Z') - 14*3600000;
  const upper = lower + 52*3600000;
  for (const x of body.intervals) {
    if (!x || Object.keys(x).some(k => !['start','end','project'].includes(k)) ||
        !Number.isSafeInteger(x.start) || !Number.isSafeInteger(x.end) || x.end <= x.start ||
        x.start < lower || x.end > upper || x.end > now+60000 || !PROJECTS.includes(x.project)) throw Error('Invalid interval');
    if (date.format(x.start) !== body.day || date.format(x.end - 1) !== body.day) throw Error('Interval must be within the team calendar day');
  }
  if (!['ok','paused','desktop-unavailable','iphone-stale','iphone-not-configured'].includes(body.health)) throw Error('Invalid health');
  return body;
}

export function openCompanionStore(file, now = () => Date.now()) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS companion_pairings (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS companion_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, seen INTEGER, health TEXT, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS companion_snapshots (device_id TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device_id,day));`);
  const pair = db.transaction((code, name) => {
    const p = db.prepare('SELECT * FROM companion_pairings WHERE hash=? AND expires>?').get(hash(code),now());
    if (!p) throw Error('Pairing code expired or invalid');
    const id = secret(), token = secret();
    db.prepare('DELETE FROM companion_pairings WHERE hash=?').run(hash(code));
    db.prepare('INSERT INTO companion_devices(id,user_id,token_hash,name) VALUES(?,?,?,?)').run(id,p.user_id,hash(token),name);
    return {id,token};
  });
  return {
    pairing(userId) {
      const code = secret();
      db.prepare('DELETE FROM companion_pairings WHERE user_id=? OR expires<?').run(userId,now());
      db.prepare('INSERT INTO companion_pairings VALUES(?,?,?)').run(hash(code),userId,now()+10*60000);
      return code;
    },
    pair,
    identity(token) { return db.prepare('SELECT * FROM companion_devices WHERE token_hash=? AND revoked=0').get(hash(token)); },
    upload: db.transaction((device, body) => {
      validateSnapshot(body,now());
      const old = db.prepare('SELECT revision,payload FROM companion_snapshots WHERE device_id=? AND day=?').get(device.id,body.day);
      const payload=JSON.stringify(body.intervals);
      if(old && old.revision === body.revision && old.payload !== payload) throw Error('Revision conflict');
      if(!old || old.revision < body.revision) db.prepare(`INSERT INTO companion_snapshots VALUES(?,?,?,?) ON CONFLICT(device_id,day) DO UPDATE SET revision=excluded.revision,payload=excluded.payload`).run(device.id,body.day,body.revision,payload);
      db.prepare('UPDATE companion_devices SET seen=?,health=? WHERE id=?').run(now(),body.health,device.id);
      return {accepted: true, revision: Math.max(old?.revision??0,body.revision)};
    }),
    devices(user) { return db.prepare('SELECT id,name,seen,health,revoked FROM companion_devices WHERE user_id=?').all(user); },
    revoke(user) { db.prepare('UPDATE companion_devices SET revoked=1 WHERE user_id=?').run(user); db.prepare('DELETE FROM companion_pairings WHERE user_id=?').run(user); },
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

export function companionServer(store, allowed, {host='127.0.0.1',port=5601,onSnapshot=()=>{}}={}) {
  // No browser CORS. This endpoint accepts only native paired clients; TLS is provided by the reverse proxy.
  const server=createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
    try {
      if (['GET','HEAD'].includes(req.method) && new URL(req.url,'http://localhost').pathname === '/') {
        res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
        return res.end(req.method === 'HEAD' ? undefined : setupPage(process.env.COMPANION_PUBLIC_URL || 'Use the server address provided by /splot-time pair'));
      }
      if(req.url==='/healthz' && req.method==='GET') return reply(200,{ok:true});
      if(req.method!=='POST' || !['/v1/pair','/v1/snapshot'].includes(req.url)) return reply(404,{error:'Not found'});
      if(req.headers.origin || !String(req.headers['content-type']).startsWith('application/json')) return reply(403,{error:'Native JSON client required'});
      let data='';
      for await(const chunk of req){data+=chunk; if(Buffer.byteLength(data)>300000) return reply(413,{error:'Payload too large'});}
      const body=JSON.parse(data);
      if(req.url==='/v1/pair') {
        if(typeof body.code!=='string'||body.code.length>100||typeof body.name!=='string'||body.name.length>80) return reply(400,{error:'Invalid pairing'});
        // Membership is checked again before accepting each upload.
        return reply(200,store.pair(body.code,body.name));
      }
      const device=store.identity(String(req.headers.authorization??'').replace(/^Bearer /,''));
      if(!device||!allowed(device.user_id)) return reply(401,{error:'Pair again in Slack'});
      const result=store.upload(device,body);
      // Retried uploads also retry reporting, using the current merged snapshot.
      await onSnapshot(device.user_id,body.day,store.suggestion(device.user_id,body.day));
      return reply(200,result);
    }catch(error){reply(400,{error: error instanceof SyntaxError?'Invalid JSON':'Invalid request, expired pairing code or revision conflict'});}
  });
  server.requestTimeout=15000; server.headersTimeout=10000;
  server.listen(port,host);
  return server;
}
