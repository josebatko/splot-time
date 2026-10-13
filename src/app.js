import { openCompanionStore, companionServer } from './companion.js';
import { companionCommand, reviewModal } from './companion-slack.js';
import bolt from '@slack/bolt';
import { openDb } from './db.js';
import { isValidDate, today, weekStart } from './periods.js';
import * as stats from './stats.js';
import { canLog, cleanNote, handleCommand, logHours, removeHours, validateHours } from './commands.js';
import { EDIT_ENTRY_ACTION, homeView, logModal, LOG_MODAL_ID, OPEN_LOG_ACTION, REMOVE_ENTRY_ACTION } from './views.js';

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
const ingest = companion ? companionServer(companion, user => canLog(ctx,user), {port:Number(process.env.COMPANION_PORT||5601),host:process.env.COMPANION_HOST||'127.0.0.1',onSnapshot:(user,day,s)=>ctx.db.setAutomaticHours(user,day,s.hours,s.note)}) : null;

async function publishHome(client, userId) {
  const now = ctx.now();
  const member = canLog(ctx, userId);
  const view = homeView({
    isMember: member,
    summary: member ? stats.summary(ctx.db, userId, now, anchor) : [],
    recentDays: member ? stats.recentDays(ctx.db, userId, now) : [],
    teamReport: stats.team(ctx.db, ctx.db.listMembers(), 'week', now, anchor),
  });
  await client.views.publish({ user_id: userId, view });
}

/** Opens the logging form, prefilled with what's already logged for that day. */
async function openLogModal(client, triggerId, userId, date = ctx.now()) {
  const entry = ctx.db.getEntry(userId, date);
  const view = logModal({ initialDate: date, initialHours: entry?.hours, initialNote: entry?.note });
  await client.views.open({ trigger_id: triggerId, view });
}

app.command('/splot-time', async ({ command, ack, client, logger }) => {
  const result = (companion && companionCommand(companion,ctx,command.user_id,command.text??'',process.env.COMPANION_PUBLIC_URL)) || handleCommand(ctx, command.user_id, command.text ?? '');
  if(result.review){await ack();await client.views.open({trigger_id:command.trigger_id,view:reviewModal(ctx,command.user_id,result.review)});return;}

  if (result.modal) {
    await ack();
    await openLogModal(client, command.trigger_id, command.user_id);
    return;
  }

  await ack({ response_type: 'ephemeral', text: result.text, blocks: result.blocks });
  if (result.changed) await publishHome(client, command.user_id).catch((e) => logger.error(e));
});

app.action(OPEN_LOG_ACTION, async ({ ack, body, client }) => {
  await ack();
  await openLogModal(client, body.trigger_id, body.user.id);
});

// Edit / Log buttons next to a day on the Home tab. The value is the date.
app.action(EDIT_ENTRY_ACTION, async ({ ack, body, action, client }) => {
  await ack();
  if (!isValidDate(action.value)) return;
  await openLogModal(client, body.trigger_id, body.user.id, action.value);
});

app.action(REMOVE_ENTRY_ACTION, async ({ ack, body, action, client, logger }) => {
  await ack();
  const userId = body.user.id;
  if (!isValidDate(action.value) || !canLog(ctx, userId)) return;
  removeHours(ctx, userId, action.value);
  await publishHome(client, userId).catch((e) => logger.error(e));
});

const saveLog = async ({ ack, body, view, client, logger }) => {
  const userId = body.user.id;
  const values = view.state.values;

  if (!canLog(ctx, userId)) {
    await ack({ response_action: 'errors', errors: { hours: "You're not set up in SplotTime yet. Ask an admin to add you." } });
    return;
  }

  const { hours, error } = validateHours(values.hours.value.value);
  if (error) {
    await ack({ response_action: 'errors', errors: { hours: error.replaceAll('`', '') } });
    return;
  }

  const { note, error: noteError } = cleanNote(values.note.value.value);
  if (noteError) {
    await ack({ response_action: 'errors', errors: { note: noteError } });
    return;
  }

  if(view.callback_id === 'companion_review') {
    const meta=JSON.parse(view.private_metadata);
    if(values.day.date.selected_date!==meta.day || JSON.stringify(ctx.db.getEntry(userId,meta.day))!==JSON.stringify(meta.before)) {
      await ack({response_action:'errors',errors:{day:'This day changed, or you selected another day. Close and run /splot-time review again.'}});return;
    }
  }
  const result = logHours(ctx, userId, values.day.date.selected_date, hours, note);
  if (result.error) {
    await ack({ response_action: 'errors', errors: { day: result.error } });
    return;
  }

  await ack();
  // Posting to a user ID sends a DM from the app, in its Messages tab.
  await client.chat.postMessage({ channel: userId, text: result.text }).catch((e) => logger.error(e));
  await publishHome(client, userId).catch((e) => logger.error(e));
};
app.view(LOG_MODAL_ID, saveLog);
app.view('companion_review', saveLog);

app.event('app_home_opened', async ({ event, client }) => {
  if (event.tab === 'home') await publishHome(client, event.user);
});

// Direct messages to the app understand the same commands as /splot-time,
// without the slash: "8 Checkout redesign", "stats", "team day", "help".
app.message(async ({ message, say, client, logger }) => {
  if (message.channel_type !== 'im' || message.subtype || message.bot_id) return;
  const result = handleCommand(ctx, message.user, message.text ?? '');

  if (result.modal) {
    // A message can't open the form directly, so offer a button that does.
    await say({
      text: 'Log your hours',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'Tell me your hours, e.g. `8 Checkout redesign` or `6 yesterday`, or open the form:' } },
        { type: 'actions', elements: [{ type: 'button', action_id: OPEN_LOG_ACTION, value: 'today', style: 'primary', text: { type: 'plain_text', text: 'Log hours' } }] },
      ],
    });
    return;
  }

  await say({ text: result.text, blocks: result.blocks });
  if (result.changed) await publishHome(client, message.user).catch((e) => logger.error(e));
});

app.error(async (error) => {
  console.error('SplotTime error:', error);
});

async function shutdown(){ ingest?.close(); await app.stop(); companion?.close(); ctx.db.close(); process.exit(0); }
process.once('SIGTERM',shutdown); process.once('SIGINT',shutdown);
await app.start();
console.log(`SplotTime is running (biweekly cycle anchored on ${anchor}, ${admins.size} admin(s)).`);
