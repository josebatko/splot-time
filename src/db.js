import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENTRIES_SQL = `
  CREATE TABLE entries (
    user_id    TEXT NOT NULL,
    day        TEXT NOT NULL,            -- YYYY-MM-DD
    hours      REAL NOT NULL,
    note       TEXT,                     -- what they worked on
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, day)
  )`;

/**
 * Early versions logged hours per week (a week_start column). Move those
 * entries onto the week's Monday so totals stay the same.
 */
function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(entries)').all().map((c) => c.name);
  if (columns.length === 0) {
    db.exec(ENTRIES_SQL);
    return;
  }
  if (columns.includes('day')) return;

  const note = columns.includes('note') ? 'note' : 'NULL';
  db.transaction(() => {
    db.exec('ALTER TABLE entries RENAME TO entries_weekly');
    db.exec(ENTRIES_SQL);
    db.exec(`INSERT INTO entries (user_id, day, hours, note, updated_at)
             SELECT user_id, week_start, hours, ${note}, updated_at FROM entries_weekly`);
    db.exec('DROP TABLE entries_weekly');
  })();
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      user_id    TEXT PRIMARY KEY,
      added_by   TEXT,
      added_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  migrate(db);

  const q = {
    addMember: db.prepare('INSERT OR IGNORE INTO members (user_id, added_by) VALUES (?, ?)'),
    removeMember: db.prepare('DELETE FROM members WHERE user_id = ?'),
    isMember: db.prepare('SELECT 1 FROM members WHERE user_id = ?'),
    listMembers: db.prepare('SELECT user_id FROM members ORDER BY added_at'),
    getEntry: db.prepare('SELECT hours, note FROM entries WHERE user_id = ? AND day = ?'),
    setEntry: db.prepare(`
      INSERT INTO entries (user_id, day, hours, note) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, day) DO UPDATE
        SET hours = excluded.hours, note = excluded.note, updated_at = datetime('now')
    `),
    deleteEntry: db.prepare('DELETE FROM entries WHERE user_id = ? AND day = ?'),
    sumRange: db.prepare(`
      SELECT COALESCE(SUM(hours), 0) AS total, COUNT(*) AS days
      FROM entries WHERE user_id = ? AND day BETWEEN ? AND ?
    `),
    entriesRange: db.prepare(`
      SELECT day, hours, note FROM entries
      WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day DESC
    `),
  };

  return {
    /** Returns true if the user was newly added. */
    addMember: (userId, addedBy) => q.addMember.run(userId, addedBy).changes > 0,
    /** Removes the member; their logged hours are kept. Returns true if they were a member. */
    removeMember: (userId) => q.removeMember.run(userId).changes > 0,
    isMember: (userId) => !!q.isMember.get(userId),
    listMembers: () => q.listMembers.all().map((r) => r.user_id),

    /** { hours, note } for a day, or null if nothing is logged. */
    getEntry: (userId, day) => q.getEntry.get(userId, day) ?? null,
    getHours: (userId, day) => q.getEntry.get(userId, day)?.hours ?? null,
    /**
     * Sets (replaces) the hours for a day. Pass `note` as undefined to keep the
     * existing comment, or null to clear it. Returns the previous hours or null.
     */
    setHours: db.transaction((userId, day, hours, note) => {
      const previous = q.getEntry.get(userId, day);
      q.setEntry.run(userId, day, hours, note === undefined ? previous?.note ?? null : note);
      return previous?.hours ?? null;
    }),
    deleteHours: (userId, day) => q.deleteEntry.run(userId, day).changes > 0,

    /** { total, days } logged in [from, to]. */
    sumRange: (userId, from, to) => q.sumRange.get(userId, from, to),
    /** Logged days in [from, to], newest first. */
    entriesRange: (userId, from, to) => q.entriesRange.all(userId, from, to),

    close: () => db.close(),
  };
}
