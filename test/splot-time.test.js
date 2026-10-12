import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../src/db.js';
import { periodRange, previousRange, recentRanges, resolveDay, weekStart } from '../src/periods.js';
import { handleCommand } from '../src/commands.js';
import * as stats from '../src/stats.js';
import { homeView } from '../src/views.js';

const ANCHOR = '2026-01-05';
const TODAY = '2026-10-14'; // a Wednesday

test('weekStart returns the Monday', () => {
  assert.equal(weekStart('2026-10-14'), '2026-10-12');
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // Sunday
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // crosses the year
});

test('resolveDay', () => {
  assert.equal(resolveDay('today', TODAY), TODAY);
  assert.equal(resolveDay('Yesterday', TODAY), '2026-10-13');
  assert.equal(resolveDay('wed', TODAY), TODAY); // today counts
  assert.equal(resolveDay('mon', TODAY), '2026-10-12');
  assert.equal(resolveDay('friday', TODAY), '2026-10-09'); // last Friday, never a future one
  assert.equal(resolveDay('thurs', TODAY), '2026-10-08');
  assert.equal(resolveDay('2026-09-01', TODAY), '2026-09-01');
  assert.equal(resolveDay('2026-02-30', TODAY), null);
  assert.equal(resolveDay('meeting', TODAY), null);
  assert.equal(resolveDay('sunshine', TODAY), null);
});

test('period ranges are exact calendar ranges', () => {
  assert.deepEqual(periodRange('day', TODAY, ANCHOR), { period: 'day', from: TODAY, to: TODAY, label: 'Wed, Oct 14, 2026' });
  assert.deepEqual(periodRange('week', TODAY, ANCHOR), { period: 'week', from: '2026-10-12', to: '2026-10-18', label: 'Oct 12 – Oct 18, 2026' });
  assert.deepEqual(periodRange('biweek', TODAY, ANCHOR).from, '2026-10-12'); // 40 weeks after the anchor
  assert.deepEqual(periodRange('biweek', TODAY, ANCHOR).to, '2026-10-25');
  assert.equal(periodRange('biweek', '2025-12-30', ANCHOR).from, '2025-12-22'); // before the anchor
  assert.deepEqual(periodRange('month', '2026-10-01', ANCHOR), { period: 'month', from: '2026-10-01', to: '2026-10-31', label: 'October 2026' });
  assert.equal(periodRange('month', '2026-02-10', ANCHOR).to, '2026-02-28');
  assert.equal(periodRange('quarter', TODAY, ANCHOR).label, 'Q4 2026');
  assert.equal(periodRange('year', '2026-01-01', ANCHOR).label, '2026');
});

test('previous and recent ranges', () => {
  assert.equal(previousRange(periodRange('month', '2026-03-10', ANCHOR), ANCHOR).label, 'February 2026');
  assert.equal(previousRange(periodRange('quarter', '2026-01-12', ANCHOR), ANCHOR).label, 'Q4 2025');
  assert.equal(previousRange(periodRange('biweek', TODAY, ANCHOR), ANCHOR).from, '2026-09-28');
  assert.equal(previousRange(periodRange('day', '2026-03-01', ANCHOR), ANCHOR).from, '2026-02-28');
  const months = recentRanges('month', TODAY, 12, ANCHOR).map((r) => r.label);
  assert.equal(months[0], 'October 2026');
  assert.equal(months[11], 'November 2025');
});

function setup() {
  const db = openDb(':memory:');
  const ctx = { db, admins: new Set(['UADMIN']), anchor: ANCHOR, now: () => TODAY };
  return { db, ctx, run: (user, text) => handleCommand(ctx, user, text) };
}

test('assignment and permissions', () => {
  const { run } = setup();
  assert.match(run('UBOB', 'log 8').text, /not set up/);
  assert.match(run('UBOB', 'add <@UBOB|bob>').text, /Only SplotTime admins/);
  assert.match(run('UADMIN', 'add <@UBOB|bob> <@UCAROL>').text, /Added <@UBOB>[\s\S]*Added <@UCAROL>/);
  assert.match(run('UBOB', 'log 8').text, /Logged \*8 h\*/);
  assert.match(run('UADMIN', 'unassign <@UBOB>').text, /Unassigned/);
  assert.match(run('UBOB', 'log 8').text, /not set up/);
  assert.match(run('UADMIN', 'remove <@UBOB>').text, /use `\/splot-time unassign/);
});

test('logging daily hours', () => {
  const { db, run } = setup();
  run('UADMIN', 'add <@UBOB>');
  assert.match(run('UBOB', 'log 8').text, /Wed, Oct 14, 2026/);
  assert.match(run('UBOB', 'log 7,5').text, /7\.5 h\*.*\(was 8 h\)/);
  assert.match(run('UBOB', '6 yesterday').text, /Tue, Oct 13/);
  assert.match(run('UBOB', 'log 4 fri').text, /Fri, Oct 9/);
  assert.match(run('UBOB', 'log 5 2026-09-16').text, /Wed, Sep 16/);
  assert.match(run('UBOB', 'log 5 2026-10-15').text, /future day/);
  assert.match(run('UBOB', 'log 25').text, /24 hours/);
  assert.match(run('UBOB', 'log abc').text, /must be a number/);
  assert.equal(db.getHours('UBOB', TODAY), 7.5);
  assert.equal(db.getHours('UBOB', '2026-10-09'), 4);

  assert.match(run('UBOB', 'remove yesterday').text, /Removed your hours for Tue, Oct 13/);
  assert.equal(db.getHours('UBOB', '2026-10-13'), null);
  assert.match(run('UBOB', 'remove yesterday').text, /Nothing was logged/);
  assert.match(run('UBOB', 'remove').text, /Removed your hours for Wed, Oct 14/);
  assert.match(run('UBOB', 'remove nonsense').text, /Usage/);
  assert.equal(run('UBOB', '').modal, true);
});

test('comments', () => {
  const { db, run } = setup();
  run('UADMIN', 'add <@UBOB>');
  assert.match(run('UBOB', 'log 8 Checkout redesign & <!channel> calls').text, /> Checkout redesign &amp; &lt;!channel&gt; calls/);
  assert.equal(db.getEntry('UBOB', TODAY).note, 'Checkout redesign & <!channel> calls');
  run('UBOB', 'log 9'); // no comment keeps the old one
  assert.deepEqual(db.getEntry('UBOB', TODAY), { hours: 9, note: 'Checkout redesign & <!channel> calls' });
  run('UBOB', 'log 6 yesterday API Migration');
  assert.deepEqual(db.getEntry('UBOB', '2026-10-13'), { hours: 6, note: 'API Migration' });
  run('UBOB', 'log 3 Meetings all day'); // "Meetings" isn't a day, so it's part of the comment
  assert.equal(db.getEntry('UBOB', TODAY).note, 'Meetings all day');
  assert.match(run('UBOB', `log 8 ${'x'.repeat(301)}`).text, /under 300/);
  assert.match(JSON.stringify(run('UBOB', 'history day').blocks), /API Migration/);
});

test('everyone can see everyone', () => {
  const { db, run } = setup();
  run('UADMIN', 'add <@UBOB> <@UCAROL>');
  db.setHours('UCAROL', '2026-10-12', 8, 'Design review');
  db.setHours('UCAROL', TODAY, 6, 'User interviews');
  assert.match(JSON.stringify(run('UBOB', 'stats <@UCAROL>').blocks), /14 h/);
  assert.match(JSON.stringify(run('UBOB', 'history month <@UCAROL>').blocks), /October 2026/);
  const week = JSON.stringify(run('UBOB', 'team').blocks);
  assert.match(week, /<@UCAROL>: \*14 h\*/);
  assert.match(week, /Mon, Oct 12: Design review/);
  assert.match(week, /Wed, Oct 14: User interviews/);
  const day = JSON.stringify(run('UBOB', 'team day').blocks);
  assert.match(day, /<@UCAROL>: \*6 h\*\\n> User interviews/);
  assert.match(day, /<@UBOB>: _nothing logged_/);
  assert.match(run('UBOB', 'users').text, /UCAROL/);
  assert.match(run('UBOB', 'add <@UDAVE>').text, /Only SplotTime admins/);
});

test('stats add up across periods', () => {
  const { db, run } = setup();
  run('UADMIN', 'add <@UBOB>');
  db.setHours('UBOB', '2026-10-14', 8);
  db.setHours('UBOB', '2026-10-12', 6);
  db.setHours('UBOB', '2026-10-09', 7); // last week
  db.setHours('UBOB', '2026-10-01', 5); // October, but the week of Sep 28
  db.setHours('UBOB', '2026-09-30', 4); // September
  db.setHours('UBOB', '2026-06-01', 10); // Q2
  db.setHours('UBOB', '2025-12-31', 3); // 2025

  const byPeriod = Object.fromEntries(stats.summary(db, 'UBOB', TODAY, ANCHOR).map((s) => [s.period, s]));
  assert.equal(byPeriod.week.current.total, 14);
  assert.equal(byPeriod.week.current.days, 2);
  assert.equal(byPeriod.week.previous.total, 7);
  assert.equal(byPeriod.biweek.current.total, 14);
  assert.equal(byPeriod.biweek.previous.total, 16); // Sep 28 – Oct 11
  assert.equal(byPeriod.month.current.total, 26);
  assert.equal(byPeriod.month.previous.total, 4);
  assert.equal(byPeriod.quarter.current.total, 26);
  assert.equal(byPeriod.quarter.previous.total, 4);
  assert.equal(byPeriod.year.current.total, 40);
  assert.equal(byPeriod.year.previous.total, 3);

  const days = stats.recentDays(db, 'UBOB', TODAY, 4);
  assert.deepEqual(days.map((d) => [d.day, d.hours]), [['2026-10-14', 8], ['2026-10-13', null], ['2026-10-12', 6], ['2026-10-11', null]]);

  assert.match(JSON.stringify(run('UBOB', 'history quarterly').blocks), /Q4 2026/);
  assert.match(JSON.stringify(run('UADMIN', 'team month').blocks), /team total \*26 h\*/);
  assert.match(JSON.stringify(run('UADMIN', 'team 2026-09-30 m').blocks), /September 2026/);
});

test('weekly entries from the old schema are migrated', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'splot-time-')), 'old.db');
  const old = new Database(file);
  old.exec(`
    CREATE TABLE entries (user_id TEXT NOT NULL, week_start TEXT NOT NULL, hours REAL NOT NULL, note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_start));
    INSERT INTO entries (user_id, week_start, hours, note) VALUES ('UBOB', '2026-10-05', 40, 'Old week');
  `);
  old.close();

  const db = openDb(file);
  assert.deepEqual(db.getEntry('UBOB', '2026-10-05'), { hours: 40, note: 'Old week' });
  db.setHours('UBOB', '2026-10-06', 8);
  assert.equal(db.sumRange('UBOB', '2026-10-05', '2026-10-11').total, 48);
  db.close();
  assert.deepEqual(openDb(file).getEntry('UBOB', '2026-10-06'), { hours: 8, note: null }); // reopening is a no-op
});

test('home tab stays within Slack limits', () => {
  const { db } = setup();
  for (let i = 0; i < 40; i++) {
    db.addMember(`U${i}`);
    for (let d = 12; d <= 14; d++) db.setHours(`U${i}`, `2026-10-${d}`, 8, 'x'.repeat(300));
  }
  const view = homeView({
    isMember: true,
    summary: stats.summary(db, 'U1', TODAY, ANCHOR),
    recentDays: stats.recentDays(db, 'U1', TODAY),
    teamReport: stats.team(db, db.listMembers(), 'week', TODAY, ANCHOR),
  });
  assert.ok(view.blocks.length <= 100, `${view.blocks.length} blocks`);
  for (const b of view.blocks) assert.ok((b.text?.text?.length ?? 0) <= 3000);
});
