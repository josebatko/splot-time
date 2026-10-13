import { canLog } from './commands.js';
import { resolveDay, isValidDate } from './periods.js';
import { logModal } from './views.js';

export function companionCommand(store,ctx,user,text,url) {
  const [cmd,arg]=text.trim().split(/\s+/);
  if(!['pair','devices','disconnect','review'].includes(cmd)) return null;
  if(!canLog(ctx,user)) return {text:'Ask an admin to assign you to SplotTime first.'};
  if(cmd==='pair') return {text:`Open SplotTime Companion on your Mac. Server: ${url}\nOne-time pairing code (valid 10 minutes): ${store.pairing(user)}\nTreat this code like a password. Raw titles and URLs stay on your Mac.`};
  if(cmd==='disconnect'){store.revoke(user);return {text:'All your companion devices are disconnected. Existing logged hours are unchanged.'};}
  if(cmd==='devices') return {text:store.devices(user).map(d=>`${d.name}: ${d.revoked?'disconnected':!d.seen?'not synced':Date.now()-d.seen>30*60000?'offline or stale':d.health}`).join('\n')||'No devices. Use /splot-time pair.'};
  const day=resolveDay(arg??'yesterday',ctx.now());
  if(!day||!isValidDate(day)||day>ctx.now())return {text:'Use /splot-time review yesterday or YYYY-MM-DD.'};
  const s=store.suggestion(user,day);
  if(!s.present)return {text:'No captured data for that day. Check /splot-time devices. Missing data is not zero work.'};
  return {review:{day,...s}};
}
export function reviewModal(ctx,user,suggestion) {
  const view=logModal({initialDate:suggestion.day,initialHours:suggestion.hours,initialNote:suggestion.note});
  view.callback_id='companion_review';
  view.private_metadata=JSON.stringify({day:suggestion.day,before:ctx.db.getEntry(user,suggestion.day)});
  view.blocks[0].text.text='Automatically reported activity estimate. You can correct hours and description here. Saving protects your correction from future imports.';
  return view;
}
