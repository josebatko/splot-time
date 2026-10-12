// Date and period logic. Everything works on ISO date strings ("YYYY-MM-DD")
// with UTC arithmetic, so there are no DST or timezone surprises.
// Hours are logged per day; every period is an inclusive range of days.

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_WORDS = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
};

/** The periods shown in the stats summary. `day` is also available for history and team. */
export const PERIODS = ['week', 'biweek', 'month', 'quarter', 'year'];

export const PERIOD_NAMES = {
  day: 'Daily',
  week: 'Weekly',
  biweek: 'Biweekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Yearly',
};

const PERIOD_ALIASES = {
  d: 'day', day: 'day', daily: 'day', days: 'day', today: 'day',
  w: 'week', week: 'week', weekly: 'week', weeks: 'week',
  b: 'biweek', biweek: 'biweek', biweekly: 'biweek', fortnight: 'biweek', biweeks: 'biweek',
  m: 'month', month: 'month', monthly: 'month', months: 'month',
  q: 'quarter', quarter: 'quarter', quarterly: 'quarter', quarters: 'quarter',
  y: 'year', year: 'year', yearly: 'year', years: 'year',
};

export function parsePeriod(word) {
  return PERIOD_ALIASES[String(word || '').toLowerCase()] ?? null;
}

const toMs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso, n) {
  return toIso(toMs(iso) + n * DAY_MS);
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(toMs(s)) === s;
}

/** Today's date in the server's local timezone (set TZ to control it). */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 0 = Monday … 6 = Sunday */
const weekdayIndex = (iso) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;

/** Monday of the week containing `iso`. */
export function weekStart(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

function daysBetween(a, b) {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

function shortDate(iso, withYear = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

/** "Wed, Oct 14" */
export function dayLabel(iso, withYear = false) {
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${shortDate(iso, withYear)}`;
}

/**
 * Resolves a day word relative to `now`: "today", "yesterday", a weekday name
 * ("mon", "friday": the most recent one, today included) or YYYY-MM-DD.
 * Returns null if the word isn't a day.
 */
export function resolveDay(word, now) {
  const w = String(word ?? '').toLowerCase();
  if (w === 'today') return now;
  if (w === 'yesterday') return addDays(now, -1);
  if (isValidDate(w)) return w;
  const weekday = WEEKDAY_WORDS[w];
  if (weekday == null) return null;
  return addDays(now, -((weekdayIndex(now) - weekday + 7) % 7));
}

/**
 * The period of the given type that contains `iso`.
 * Returns { period, from, to, label } with inclusive from/to dates.
 * `anchor` is a Monday that starts a biweekly cycle.
 */
export function periodRange(period, iso, anchor) {
  const [y, m] = iso.split('-').map(Number);

  switch (period) {
    case 'day':
      return { period, from: iso, to: iso, label: dayLabel(iso, true) };

    case 'week': {
      const from = weekStart(iso);
      const to = addDays(from, 6);
      return { period, from, to, label: `${shortDate(from)} – ${shortDate(to, true)}` };
    }

    case 'biweek': {
      const index = Math.floor(daysBetween(anchor, iso) / 14);
      const from = addDays(anchor, index * 14);
      const to = addDays(from, 13);
      return { period, from, to, label: `${shortDate(from)} – ${shortDate(to, true)}` };
    }

    case 'month':
      return { period, from: toIso(Date.UTC(y, m - 1, 1)), to: toIso(Date.UTC(y, m, 0)), label: `${MONTHS_LONG[m - 1]} ${y}` };

    case 'quarter': {
      const q = Math.floor((m - 1) / 3);
      return { period, from: toIso(Date.UTC(y, q * 3, 1)), to: toIso(Date.UTC(y, q * 3 + 3, 0)), label: `Q${q + 1} ${y}` };
    }

    case 'year':
      return { period, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };

    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

/** The period immediately before `range`. */
export function previousRange(range, anchor) {
  return periodRange(range.period, addDays(range.from, -1), anchor);
}

/** The `count` most recent periods ending with the one containing `iso`, newest first. */
export function recentRanges(period, iso, count, anchor) {
  const ranges = [periodRange(period, iso, anchor)];
  while (ranges.length < count) ranges.push(previousRange(ranges.at(-1), anchor));
  return ranges;
}
