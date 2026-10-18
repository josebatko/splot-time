import { canLog } from './commands.js';

const base = url => url.replace(/\/+$/,'');
export const macCommand = (url, token) => `curl -fsSL ${base(url)}/install.sh | sh -s -- ${token}`;
export const windowsCommand = (url, token) => `powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "$env:SPLOT_TOKEN='${token}'; irm ${base(url)}/install.ps1 | iex"`;

export function connectText(url, token) {
  return `*Connect your computer (one time, about a minute)*\n*Mac:* open *Terminal* (⌘ Space, type Terminal, Return), paste this and press Return:\n\`\`\`${macCommand(url,token)}\`\`\`\n*Windows:* press *Win + R*, paste this and press Return:\n\`\`\`${windowsCommand(url,token)}\`\`\`\nThat's it. Your computer then syncs ActivityWatch every hour in the background, also after restarts, so you can close the window when it says Done. If ActivityWatch isn't installed, the command opens its download page.\nKeep these commands private; they identify you. Running \`/splot-time connect\` again replaces your previous computer.`;
}

const ago = ms => { const h = Math.round((Date.now()-ms)/3600000); return h < 1 ? 'less than an hour ago' : h < 48 ? `${h} h ago` : `${Math.round(h/24)} days ago`; };

export function companionCommand(store,ctx,user,text,url) {
  const [cmd]=text.trim().split(/\s+/);
  if(!['connect','pair','devices','disconnect'].includes(cmd)) return null;
  if(!canLog(ctx,user)) return {text:'Ask an admin to assign you to SplotTime first.'};
  if(cmd==='connect'||cmd==='pair') return {text:connectText(url,store.connect(user))};
  if(cmd==='disconnect'){store.revoke(user);return {text:'Your computer is disconnected. It stops sending activity on its next sync. Hours already recorded are kept.'};}
  if(cmd==='devices') return {text:store.devices(user).map(d=>`${d.name}: ${d.delivered?`last synced ${ago(d.delivered)}`:d.health==='no-activitywatch-data'?'connected, but ActivityWatch has no data yet':'not synced yet'}`).join('\n')||'No computer connected. Use /splot-time connect.'};
}
