import { openCompanionStore, companionServer } from './companion.js';
import { companionCommand, problems, statusBlocks, describe } from './companion-slack.js';
import bolt from '@slack/bolt';
import { openDb } from './db.js';
import { isValidDate, today, weekStart } from './periods.js';
import * as stats from './stats.js';
import { canLog, handleCommand } from './commands.js';
import { homeView } from './views.js';

const { App, LogLevel } = bolt;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const anchorSetting = process.env.BIWEEK_ANCHOR || '2026-01-05';
if (!isValidDate(anchorSetting)) throw new Error('BIWEEK_ANCHOR must be a date like 2026-01-05');
// Biweekly cycles always start on a Monday.
const anchor = weekStart(anchorSetting);

const admins = new Set((process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
if (admins.size === 0) console.warn('ADMIN_USER_IDS is empty, so nobody can assign people. Set it in .env.');

const ctx = {
  db: openDb(process.env.DATABASE_PATH || './data/splot-time.db'),
  admins,
  anchor,
  now: () => today(),
};

const app = new App({
  token: requireEnv('SLACK_BOT_TOKEN'),
  appToken: requireEnv('SLACK_APP_TOKEN'),
  socketMode: true,
  logLevel: process.env.LOG_LEVEL || LogLevel.INFO,
});

const companion = process.env.COMPANION_PUBLIC_URL ? openCompanionStore(process.env.DATABASE_PATH || './data/splot-time.db') : null;
const ingest = companion ? companionServer(companion, user => canLog(ctx,user), {port:Number(process.env.COMPANION_PORT||5601),host:process.env.COMPANION_HOST||'127.0.0.1',onSnapshot:(user,day,s)=>ctx.db.recordHours(user,day,s.hours)}) : null;

// A computer that has gone quiet for two days gets one DM. The existing connection
// is left alone, since the computer may simply have been off.
// Reminders reset after the next successful sync.
async function remindSilentComputers() {
  for (const d of companion.silent(48*3600000)) {
    if (!canLog(ctx, d.user_id)) continue;
    const text = d.health === 'no-activitywatch-data'
      ? 'Your computer is connected to SplotTime, but ActivityWatch has no data yet. Open ActivityWatch once; nothing else is needed.'
      : 'SplotTime has not received activity from your computer for two days, so no hours are being recorded. If it was off, ignore this. Otherwise open ActivityWatch, or run `/splot-time connect` and paste the command again.';
    try { await app.client.chat.postMessage({ channel: d.user_id, text }); companion.markNudged(d.id); }
    catch (e) { console.error('SplotTime reminder error:', e); }
  }
}
// Every morning at 9, admins get one DM listing anyone whose hours are not arriving.
let digestDay = null;
async function adminDigest() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: process.env.TZ || 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(Date.now()));
  if (hour !== 9 || digestDay === ctx.now()) return;
  digestDay = ctx.now();
  const rows = problems(companion, ctx);
  if (!rows.length) return;
  const text = `*SplotTime: ${rows.length} ${rows.length === 1 ? 'person is' : 'people are'} not syncing*\n` + rows.map(r => `• <@${r.user}>: ${describe(r)}`).join('\n') + '\n`/splot-time status` shows everyone.';
  for (const admin of admins) await app.client.chat.postMessage({ channel: admin, text }).catch(e => console.error('SplotTime digest error:', e));
}
const hourly = () => Promise.all([remindSilentComputers(), adminDigest()]).catch(e => console.error('SplotTime reminder error:', e));
const reminders = companion ? setInterval(hourly, 15 * 60000) : null;

async function publishHome(client, userId) {
  const now = ctx.now();
  const member = canLog(ctx, userId);
  const view = homeView({
    isMember: member,
    summary: member ? stats.summary(ctx.db, userId, now, anchor) : [],
    recentDays: member ? stats.recentDays(ctx.db, userId, now) : [],
    teamReport: stats.team(ctx.db, ctx.db.listMembers(), 'week', now, anchor),
  });
  // Admins also see everyone's sync status on their Home tab.
  if (companion && admins.has(userId)) view.blocks.push({ type: 'divider' }, ...statusBlocks(companion, ctx));
  view.blocks = view.blocks.slice(0, 100);
  await client.views.publish({ user_id: userId, view });
}

app.command('/splot-time', async ({ command, ack }) => {
  const result = (companion && companionCommand(companion,ctx,command.user_id,command.text??'',process.env.COMPANION_PUBLIC_URL)) || handleCommand(ctx, command.user_id, command.text ?? '');
  await ack({ response_type: 'ephemeral', text: result.text, blocks: result.blocks });
});

app.event('app_home_opened', async ({ event, client }) => {
  if (event.tab === 'home') await publishHome(client, event.user);
});

// Direct messages to the app understand the same commands as /splot-time,
// without the slash: "stats", "team day", "help".
app.message(async ({ message, say }) => {
  if (message.channel_type !== 'im' || message.subtype || message.bot_id) return;
  const result = handleCommand(ctx, message.user, message.text ?? '');
  await say({ text: result.text, blocks: result.blocks });
});

app.error(async (error) => {
  console.error('SplotTime error:', error);
});

async function shutdown(){ clearInterval(reminders); ingest?.close(); await app.stop(); companion?.close(); ctx.db.close(); process.exit(0); }
process.once('SIGTERM',shutdown); process.once('SIGINT',shutdown);
await app.start();
console.log(`SplotTime is running (biweekly cycle anchored on ${anchor}, ${admins.size} admin(s)).`);
