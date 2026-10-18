import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { openCompanionStore, companionServer, activityQuery } from '../src/companion.js';
import { isWork, workByDay } from '../src/classify.js';
import { installScript, syncScript } from '../src/install-script.js';
import { companionCommand, problems } from '../src/companion-slack.js';

const now = Date.parse('2026-10-15T16:00:00Z'); // 18:00 in Warsaw
const ev = (iso, minutes, data) => ({ timestamp: iso, duration: minutes * 60, data });
const buckets = {
  'aw-watcher-window_mac': { id: 'aw-watcher-window_mac', hostname: 'mac' },
  'aw-watcher-afk_mac': { id: 'aw-watcher-afk_mac', hostname: 'mac' },
  'aw-watcher-window_old.home': { id: 'aw-watcher-window_old.home', hostname: 'old.home' },
  'aw-watcher-afk_old.home': { id: 'aw-watcher-afk_old.home', hostname: 'old.home' },
  'aw-watcher-window_x-synced-from-y': { id: 'aw-watcher-window_x-synced-from-y', hostname: 'y' },
  'aw-watcher-afk_x-synced-from-y': { id: 'aw-watcher-afk_x-synced-from-y', hostname: 'y' },
};

test('work rules: tools and work sites count, personal and unclear activity does not', () => {
  for (const d of [{ app: 'Slack' }, { app: 'ChatGPT', title: 'Pricing' }, { app: 'Claude' }, { app: 'Safari', url: 'https://chatgpt.com/c/1' },
    { app: 'Safari', url: 'https://usesplot.twenty.com/objects' }, { app: 'Google Chrome', url: 'https://i.alibaba.com/x' },
    { app: 'Safari', url: 'https://www.youtube.com/watch?v=1', title: 'Debugging a React API' },
    { app: 'Code.exe' }, { app: 'slack.exe' }, { app: 'WindowsTerminal.exe' }, { app: 'chrome.exe', title: 'Pull requests · GitHub - Google Chrome' },
    { app: 'msedge.exe', title: 'Supplier list - Google Sheets - Microsoft Edge' }]) assert.equal(isWork(d), true, JSON.stringify(d));
  for (const d of [{ app: 'Hearthstone' }, { app: 'loginwindow' }, { app: 'Safari', url: 'https://www.youtube.com/watch?v=1', title: 'Highlights' },
    { app: 'ChatGPT', title: 'Dinner recipes' }, { app: 'Safari', url: 'https://github.com/x', incognito: true }, { app: 'Safari', url: 'http://localhost:5600/' },
    { app: 'Safari' }, { app: 'explorer.exe', title: 'splot' }, { app: 'chrome.exe', title: 'Highlights - YouTube - Google Chrome' }, { app: 'Hearthstone.exe' }]) assert.equal(isWork(d), false, JSON.stringify(d));
});

test('work is merged, clipped to now and split at Warsaw midnight', () => {
  const days = workByDay([
    ev('2026-10-14T21:30:00Z', 60, { app: 'Slack' }),          // 23:30–00:30 Warsaw
    ev('2026-10-14T21:45:00Z', 10, { app: 'Code' }),           // overlaps, counted once
    ev('2026-10-15T15:30:00Z', 60, { app: 'Slack' }),          // runs past now
    ev('2026-10-15T10:00:00Z', 60, { app: 'Hearthstone' }),
  ], 'Europe/Warsaw', now);
  const minutes = d => days[d].reduce((n, x) => n + x.end - x.start, 0) / 60000;
  assert.equal(minutes('2026-10-14'), 30);
  assert.equal(minutes('2026-10-15'), 60);
});

test('query pairs window and idle buckets per hostname and skips synced ones', () => {
  const q = activityQuery(buckets, now - 1, now);
  assert.equal(q.timeperiods.length, 1);
  assert.equal(q.query.length, 3);
  assert.match(q.query.at(-1), /RETURN = concat\(r0, r1\);/);
  assert.doesNotMatch(q.query.join(''), /synced/);
  assert.equal(activityQuery({ w: { id: 'aw-watcher-window_a', hostname: 'a' } }, 0, 1), null);
});

test('install scripts embed the server and the sync script, never a token', () => {
  for (const os of ['mac', 'windows']) {
    const s = installScript('https://time.example.com/', os);
    assert.match(s, /S ?= ?'https:\/\/time\.example\.com'/);
    assert.doesNotMatch(s, /__SERVER__|__SYNC__/);
  }
  assert.match(installScript('https://x', 'mac'), /run\.sh<\/string><\/array>[\s\S]*StartInterval/);
  for (const os of ['mac', 'windows']) assert.match(syncScript('https://x', os), /# end of SplotTime sync\n$/);
  assert.match(installScript('https://x', 'windows'), /Register-ScheduledTask/);
});

async function withServer(fn, { allowed = () => true } = {}) {
  let t = now;
  const store = openCompanionStore(':memory:', () => t, 'Europe/Warsaw'), db = openDb(':memory:');
  const server = companionServer(store, u => allowed(u), { port: 0, publicUrl: 'https://time.example.com', onSnapshot: (u, d, s) => db.recordHours(u, d, s.hours) });
  await new Promise(r => server.once('listening', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (path, token, body, headers = {}) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...headers }, body: JSON.stringify(body) });
  try { await fn({ store, db, url, post, tick: ms => { t += ms; } }); } finally { await new Promise(r => server.close(r)); store.close(); db.close(); }
}

test('sync: query, then activity fills the last days and replaces them on the next sync', () => withServer(async ({ store, db, post }) => {
  const token = store.connect('U1');
  const q = await post('/v1/query', token, buckets);
  assert.equal(q.status, 200);
  const { timeperiods } = await q.json();
  assert.equal(timeperiods[0].split('/')[0], '2026-10-07T22:00:00.000Z'); // Warsaw midnight, seven days back
  const r = await post('/v1/activity', token, [[ev('2026-10-15T08:00:00Z', 120, { app: 'Slack', title: 'secret title' }), ev('2026-10-13T08:00:00Z', 30, { app: 'Figma' })]]);
  assert.deepEqual((await r.json()).days, ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
  assert.equal(db.getHours('U1', '2026-10-15'), 2);
  assert.equal(db.getHours('U1', '2026-10-13'), 0.5);
  assert.equal(db.getHours('U1', '2026-10-12'), null);
  assert.equal(store.devices('U1')[0].health, 'ok');
  await post('/v1/query', token, buckets);
  await post('/v1/activity', token, [[ev('2026-10-15T08:00:00Z', 60, { app: 'Slack' }), ev('2026-10-13T08:00:00Z', 15, { app: 'Figma' })]]);
  assert.equal(db.getHours('U1', '2026-10-15'), 1);
  assert.equal(db.getHours('U1', '2026-10-13'), 0.25);
  // A result missing a day that was already captured keeps it rather than zeroing it.
  await post('/v1/query', token, buckets);
  await post('/v1/activity', token, [[ev('2026-10-15T08:00:00Z', 60, { app: 'Slack' })]]);
  assert.equal(db.getHours('U1', '2026-10-13'), 0.25);
}));

test('sync rejects bad tokens, browsers, non-members and activity without a query', () => withServer(async ({ store, post }) => {
  const token = store.connect('U1');
  assert.equal((await post('/v1/query', 'bad', buckets)).status, 401);
  assert.equal((await post('/v1/query', token, buckets, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/v1/activity', token, [[]])).status, 400);
  assert.equal((await post('/v1/query', token, {})).status, 409);
  const again = store.connect('U1');
  assert.equal((await post('/v1/query', token, buckets)).status, 401);
  assert.equal((await post('/v1/query', again, buckets)).status, 200);
}, { allowed: u => u === 'U1' }));

test('silent Macs are reminded once until they sync again', () => withServer(async ({ store, post, tick }) => {
  const token = store.connect('U1');
  assert.equal(store.silent(48 * 3600000).length, 0);
  tick(49 * 3600000);
  const [d] = store.silent(48 * 3600000);
  assert.equal(d.user_id, 'U1');
  store.markNudged(d.id);
  assert.equal(store.silent(48 * 3600000).length, 0);
  await post('/v1/query', token, buckets);
  await post('/v1/activity', token, [[]]);
  tick(49 * 3600000);
  assert.equal(store.silent(48 * 3600000).length, 1);
}));

test('setup page and install script are public, everything else needs a token', async () => {
  const server = companionServer({}, () => false, { port: 0, publicUrl: 'https://time.example.com' });
  await new Promise(r => server.once('listening', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.match(await (await fetch(url + '/')).text(), /Connect your computer/);
    assert.match(await (await fetch(url + '/install.sh')).text(), /com\.splot\.time\.sync/);
    assert.match(await (await fetch(url + '/install.ps1')).text(), /SplotTime sync/);
    assert.match(await (await fetch(url + '/agent/sync.sh')).text(), /S='https:\/\/time\.example\.com'/);
    assert.match(await (await fetch(url + '/agent/sync.ps1')).text(), /end of SplotTime sync/);
    assert.equal((await fetch(url + '/agent/run.sh')).status, 404);
    assert.equal((await fetch(url + '/v1/snapshot', { method: 'POST' })).status, 404);
  } finally { await new Promise(r => server.close(r)); }
});

test('admins see every teammate\'s sync state, with errors the computer reported', () => withServer(async ({ store, db, post, tick }) => {
  for (const u of ['UOK', 'UERR', 'UNEW', 'UOFF']) db.addMember(u, 'UADMIN');
  const ok = store.connect('UOK'), err = store.connect('UERR');
  store.connect('UNEW');
  await post('/v1/query', ok, buckets, { 'x-splottime-client': 'windows' });
  await post('/v1/activity', ok, [[ev('2026-10-15T08:00:00Z', 90, { app: 'slack.exe' })]]);
  await post('/v1/status', err, { message: 'ActivityWatch is not installed' }, { 'x-splottime-client': 'mac' });
  tick(3 * 3600000);
  const ctx = { db, admins: new Set(['UADMIN']), now: () => '2026-10-15' };
  const byUser = Object.fromEntries(store.overview(db.listMembers()).map(r => [r.user, r]));
  assert.equal(byUser.UOK.state, 'late');
  assert.equal(byUser.UOK.device.client, 'windows');
  assert.equal(byUser.UERR.state, 'never-synced');
  assert.equal(byUser.UOFF.state, 'not-connected');
  const view = JSON.stringify(companionCommand(store, ctx, 'UADMIN', 'status', 'https://x').blocks);
  assert.match(view, /<@UOK> · Windows · synced 3 h ago · today 1\.5 h, week 1\.5 h/);
  assert.match(view, /<@UERR> · Mac · connected 3 h ago, never synced · last error 3 h ago: _ActivityWatch is not installed_/);
  assert.match(view, /<@UOFF> · not connected/);
  assert.match(companionCommand(store, ctx, 'UOK', 'status', 'https://x').text, /Only SplotTime admins/);
  assert.match(companionCommand(store, ctx, 'UOK', 'devices', 'https://x').text, /Windows · synced 3 h ago/);
  assert.deepEqual(problems(store, ctx).map(r => r.user).sort(), ['UERR', 'UNEW', 'UOFF']);
  await post('/v1/query', err, buckets);
  await post('/v1/activity', err, [[]]);
  assert.equal(store.devices('UERR')[0].error, null);
}));
