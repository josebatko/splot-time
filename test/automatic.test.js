import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { openCompanionStore, companionServer } from '../src/companion.js';
test('automatic totals update and correct downward without overwriting manual hours or removals',()=>{
 const db=openDb(':memory:');const day='2026-10-12';
 assert.equal(db.setAutomaticHours('U',day,2,'Selected work apps'),true);
 assert.equal(db.setAutomaticHours('U',day,1,'Selected work apps'),true);
 assert.equal(db.getHours('U',day),1);assert.match(db.getEntry('U',day).note,/Automatic estimate/);
 db.setHours('U',day,4,'Corrected');assert.equal(db.setAutomaticHours('U',day,5,''),false);assert.equal(db.getHours('U',day),4);
 db.deleteHours('U',day);assert.equal(db.setAutomaticHours('U',day,6,''),false);assert.equal(db.getHours('U',day),null);
 db.setHours('V',day,3,'Manual');assert.equal(db.setAutomaticHours('V',day,9,''),false);db.close();
});
test('automatic reporting retries after failure, merges devices and ignores stale revisions',async()=>{
 const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw'}).format(now);
 const s=openCompanionStore(':memory:',()=>now),db=openDb(':memory:');let fail=true;
 const server=companionServer(s,()=>true,{port:0,onSnapshot:(u,d,x)=>{if(fail)throw Error('temporary failure');db.setAutomaticHours(u,d,x.hours,x.note);}});
 await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const a=s.pair(s.pairing('U'),'A'),b=s.pair(s.pairing('U'),'B');
 const snapshot={day,revision:1,health:'ok',intervals:[{start:now-60000,end:now,project:'Selected work apps'}]};
 const post=(device,body=snapshot)=>fetch(url+'/v1/snapshot',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+device.token},body:JSON.stringify(body)});
 try{
 assert.equal((await post(a)).status,400);fail=false;assert.equal((await post(a)).status,200);assert.equal(db.getHours('U',day),0.02);
 await post(b);assert.equal(db.getHours('U',day),0.02);
 await post(a,{...snapshot,revision:2,intervals:[]});await post(b,{...snapshot,revision:2,intervals:[]});assert.equal(db.getHours('U',day),0);
 await post(a);assert.equal(db.getHours('U',day),0);
 }finally{await new Promise(r=>server.close(r));s.close();db.close();}
});
