import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCompanionStore, validateSnapshot, mergeIntervals, companionServer } from '../src/companion.js';
const now=Date.parse('2026-10-12T18:00:00Z');
const body=(revision=1)=>({day:'2026-10-12',revision,health:'ok',intervals:[{start:now-3600000,end:now,project:'Product & Engineering'}]});
test('pairing is one-use, expires, and tokens are revocable',()=>{
 let t=now;const s=openCompanionStore(':memory:',()=>t);const code=s.pairing('U1');t+=600001;assert.throws(()=>s.pair(code,'Mac'));
 const c=s.pairing('U1'),d=s.pair(c,'Mac');assert.throws(()=>s.pair(c,'Mac'));assert.equal(s.identity(d.token).user_id,'U1');s.revoke('U1');assert.equal(s.identity(d.token),undefined);s.close();
});
test('uploads are idempotent, revisions monotonic, users isolated, overlapping devices merged',()=>{
 const s=openCompanionStore(':memory:',()=>now);const a=s.identity(s.pair(s.pairing('U1'),'A').token),b=s.identity(s.pair(s.pairing('U1'),'B').token);
 s.upload(a,body());s.upload(a,body());s.upload(b,body());assert.equal(s.suggestion('U1','2026-10-12').hours,1);assert.equal(s.suggestion('U2','2026-10-12').present,false);
 s.upload(a,{...body(2),intervals:[]});s.upload(a,body());assert.equal(s.suggestion('U1','2026-10-12').hours,1);
 assert.throws(()=>s.upload(b,{...body(),intervals:[]}));s.close();
});
test('rejects raw history, invalid interval, future time and invalid category',()=>{
 assert.throws(()=>validateSnapshot({...body(),url:'private'},now));assert.throws(()=>validateSnapshot({...body(),intervals:[{...body().intervals[0],title:'private'}]},now));
 assert.throws(()=>validateSnapshot({...body(),intervals:[{...body().intervals[0],end:now+60001}]},now));
 assert.deepEqual(mergeIntervals([{start:1,end:5},{start:3,end:7},{start:9,end:10}]),[[1,7],[9,10]]);
});
test('HTTP upload requires pairing, membership and native request',async()=>{
 const s=openCompanionStore(':memory:',()=>now);let allowed=true;const server=companionServer(s,()=>allowed,{port:0});await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 try{
 const d=s.pair(s.pairing('U1'),'Mac');const post=(token,extra={})=>fetch(url+'/v1/snapshot',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,...extra},body:JSON.stringify(body())});
 assert.equal((await post('bad')).status,401);assert.equal((await post(d.token)).status,200);assert.equal((await post(d.token,{origin:'https://evil.test'})).status,403);allowed=false;assert.equal((await post(d.token)).status,401);
 }finally{await new Promise(r=>server.close(r));s.close();}
});
test('snapshots cannot count another team calendar day',()=>{
 const midnight=Date.parse('2026-10-12T22:00:00Z');
 const snapshot={...body(),intervals:[{...body().intervals[0],start:midnight-1000,end:midnight}]};
 assert.doesNotThrow(()=>validateSnapshot(snapshot,midnight,'Europe/Warsaw'));
 assert.throws(()=>validateSnapshot({...snapshot,intervals:[{...snapshot.intervals[0],end:midnight+1}]},midnight,'Europe/Warsaw'));
});

test('opening the server address shows setup instructions without granting access',async()=>{
 const server=companionServer({},()=>false,{port:0});await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 try {
  const response=await fetch(url+'/');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
  assert.match(await response.text(),/Connect your Mac/);
  assert.equal((await fetch(url+'/missing')).status,404);
  assert.equal((await fetch(url+'/v1/pair')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
