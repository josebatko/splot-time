import { canLog } from './commands.js';
import { weekStart } from './periods.js';
import { fmtHours } from './views.js';

const base = url => url.replace(/\/+$/,'');
export const macCommand = (url, token) => `curl -fsSL ${base(url)}/install.sh | sh -s -- ${token}`;
export const windowsCommand = (url, token) => `powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command "$env:SPLOT_TOKEN='${token}'; irm ${base(url)}/install.ps1 | iex"`;

export function connectText(url, token) {
  return `*Connect your computer (one time, about a minute)*\n*Mac:* open *Terminal* (⌘ Space, type Terminal, Return), paste this and press Return:\n\`\`\`${macCommand(url,token)}\`\`\`\n*Windows:* press *Win + R*, paste this and press Return:\n\`\`\`${windowsCommand(url,token)}\`\`\`\nThat's it. Your computer then syncs ActivityWatch every hour in the background, also after restarts, so you can close the window when it says Done. If ActivityWatch isn't installed, the command opens its download page.\nKeep these commands private; they identify you. Running \`/splot-time connect\` again replaces your previous computer.`;
}

const ago = (ms, at = Date.now()) => { const h = Math.round((at-ms)/3600000); return h < 1 ? 'less than an hour ago' : h < 48 ? `${h} h ago` : `${Math.round(h/24)} days ago`; };

export function companionCommand(store,ctx,user,text,url) {
  const [cmd]=text.trim().split(/\s+/);
  if(!['connect','pair','devices','disconnect','status'].includes(cmd)) return null;
  if(cmd==='status') return ctx.admins.has(user) ? {text:'SplotTime sync status',blocks:statusBlocks(store,ctx)} : {text:'Only SplotTime admins can do that.'};
  if(!canLog(ctx,user)) return {text:'Ask an admin to assign you to SplotTime first.'};
  if(cmd==='connect'||cmd==='pair') return {text:connectText(url,store.connect(user))};
  if(cmd==='disconnect'){store.revoke(user);return {text:'Your computer is disconnected. It stops sending activity on its next sync. Hours already recorded are kept.'};}
  if(cmd==='devices') { const [row] = store.overview([user]); return {text: row.state==='not-connected' ? 'No computer connected. Use /splot-time connect.' : describe(row)}; }
}

const ICON = { ok: ':large_green_circle:', new: ':large_green_circle:', late: ':large_yellow_circle:', silent: ':red_circle:', 'never-synced': ':red_circle:', 'not-connected': ':white_circle:' };
const OS = { mac: 'Mac', windows: 'Windows' };

/** One line about a person's computer: what it is, when it last synced, and why it failed. */
export function describe({ state, device: d, at }) {
  if (state === 'not-connected') return 'not connected';
  const parts = [OS[d.client] ?? 'computer'];
  parts.push(d.delivered ? `synced ${ago(d.delivered, at)}` : state === 'new' ? 'just connected' : `connected ${ago(d.created ?? 0, at)}, never synced`);
  if (d.error) parts.push(`last error ${ago(d.error_at, at)}: _${d.error}_`);
  else if (d.health === 'no-activitywatch-data') parts.push('_ActivityWatch has no data yet_');
  return parts.join(' · ');
}

/** Admin view: every assigned person (admins only if also assigned), problems first, with today's and this week's hours. */
export function statusBlocks(store, ctx) {
  const rows = store.overview(ctx.db.listMembers());
  const today = ctx.now(), monday = weekStart(today);
  const counts = rows.reduce((n, r) => ({ ...n, [r.state]: (n[r.state] ?? 0) + 1 }), {});
  const healthy = (counts.ok ?? 0) + (counts.new ?? 0);
  const lines = rows.map(r => `${ICON[r.state]} <@${r.user}> · ${describe(r)} · today ${fmtHours(ctx.db.getHours(r.user, today) ?? 0)}, week ${fmtHours(ctx.db.sumRange(r.user, monday, today).total)}`);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Sync status' } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${healthy} of ${rows.length} syncing · :large_yellow_circle: no sync for 2+ h · :red_circle: no sync for 2+ days or never · :white_circle: not connected` }] },
  ];
  for (let i = 0; i < lines.length; i += 25) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.slice(i, i + 25).join('\n').slice(0, 3000) } });
  return blocks;
}

/** People who need attention, for the admins' daily digest. */
export const problems = (store, ctx) => store.overview(ctx.db.listMembers()).filter(r => ['silent','never-synced','not-connected'].includes(r.state));
