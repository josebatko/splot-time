import { addDays, PERIODS, periodRange, previousRange, recentRanges } from './periods.js';

function totals(db, userId, range) {
  const { total, days } = db.sumRange(userId, range.from, range.to);
  return { range, total, days };
}

/** Current and previous totals for every summary period. */
export function summary(db, userId, iso, anchor) {
  return PERIODS.map((period) => {
    const range = periodRange(period, iso, anchor);
    return { period, current: totals(db, userId, range), previous: totals(db, userId, previousRange(range, anchor)) };
  });
}

/** Totals for the `count` most recent periods, newest first. Daily rows include the comment. */
export function history(db, userId, period, iso, anchor, count = period === 'day' ? 14 : 12) {
  return recentRanges(period, iso, count, anchor).map((range) => ({
    ...totals(db, userId, range),
    note: period === 'day' ? db.getEntry(userId, range.from)?.note ?? null : null,
  }));
}

/** The last `count` days up to `iso`, including days with nothing logged. Newest first. */
export function recentDays(db, userId, iso, count = 7) {
  const from = addDays(iso, -(count - 1));
  const logged = new Map(db.entriesRange(userId, from, iso).map((e) => [e.day, e]));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(iso, -i);
    return { day, hours: logged.get(day)?.hours ?? null, note: logged.get(day)?.note ?? null };
  });
}

/**
 * Every member's totals for the period containing `iso`. For a day or a week,
 * each row also lists the commented days so people can see what others worked on.
 */
export function team(db, userIds, period, iso, anchor) {
  const range = periodRange(period, iso, anchor);
  const withNotes = period === 'day' || period === 'week';
  const rows = userIds
    .map((userId) => ({
      userId,
      ...db.sumRange(userId, range.from, range.to),
      notes: withNotes ? db.entriesRange(userId, range.from, range.to).filter((e) => e.note).reverse() : [],
    }))
    .sort((a, b) => b.total - a.total);
  return { range, rows };
}
