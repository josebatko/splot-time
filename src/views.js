// Block Kit builders. Pure functions: data in, Slack JSON out.

import { dayLabel, PERIOD_NAMES } from './periods.js';

export const fmtHours = (h) => `${Number(h.toFixed(2))} h`;

/** Escapes user-written text so it can't trigger mentions like <!channel>. */
export const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const quoteNote = (note) => (note ? `\n> ${escape(note).replaceAll('\n', '\n> ')}` : '');
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
const header = (text) => ({ type: 'header', text: { type: 'plain_text', text } });
const divider = { type: 'divider' };

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function totalLine({ total, days }) {
  const avg = days > 1 ? ` · avg ${fmtHours(total / days)}/day` : '';
  return `*${fmtHours(total)}*  _(${plural(days, 'day')} logged${avg})_`;
}

// A section holds at most 3000 characters, so long lists are split across several.
function chunk(lines, maxLength = 2800) {
  const groups = [[]];
  let length = 0;
  for (const line of lines) {
    if (length + line.length > maxLength && groups.at(-1).length) {
      groups.push([]);
      length = 0;
    }
    groups.at(-1).push(line);
    length += line.length + 1;
  }
  return groups.map((g) => section(g.join('\n')));
}

function periodBlocks(summary) {
  return summary.map(({ period, current, previous }) => section(
    `*${PERIOD_NAMES[period]}* · ${current.range.label}\n` +
    `${totalLine(current)}\n` +
    `Previous (${previous.range.label}): ${fmtHours(previous.total)}`,
  ));
}

const dayText = (d) =>
  `*${dayLabel(d.day)}*: ${d.hours == null ? '_not logged_' : `*${fmtHours(d.hours)}*`}${quoteNote(d.note)}`;

const recentDayBlocks = (recentDays) => [section(`*Recent days*\n${recentDays.map(dayText).join('\n')}`)];

/** Stats for every period type, plus the last few days. */
export function summaryBlocks({ title, userId, summary, recentDays }) {
  const blocks = [header(title)];
  if (userId) blocks.push(context(`Stats for <@${userId}>`));
  blocks.push(...periodBlocks(summary));
  if (recentDays?.length) blocks.push(divider, ...recentDayBlocks(recentDays));
  return blocks;
}

export function historyBlocks({ userId, period, rows }) {
  const lines = rows.map((r) =>
    period === 'day'
      ? `${r.range.label}: ${r.days ? `*${fmtHours(r.total)}*` : '_not logged_'}${quoteNote(r.note)}`
      : `${r.range.label}: ${totalLine(r)}`);
  return [
    header(`${PERIOD_NAMES[period]} history`),
    context(`<@${userId}> · last ${rows.length} ${period === 'day' ? 'days' : 'periods'}, newest first`),
    ...chunk(lines),
  ];
}

function teamLine(row, period) {
  const total = period === 'day' ? `*${fmtHours(row.total)}*` : totalLine(row);
  const notes = row.notes.map((n) =>
    period === 'day' ? escape(truncate(n.note, 200)) : `${dayLabel(n.day)}: ${escape(truncate(n.note, 80))}`);
  return `<@${row.userId}>: ${row.days ? total : '_nothing logged_'}${notes.map((n) => `\n> ${n.replaceAll('\n', ' ')}`).join('')}`;
}

export function teamBlocks({ period, report, title = `Team · ${PERIOD_NAMES[period]}` }) {
  const lines = report.rows.length
    ? report.rows.map((r) => teamLine(r, period))
    : ['_No members yet. Admins can add people with_ `/splot-time add @someone`'];
  const total = report.rows.reduce((sum, r) => sum + r.total, 0);
  return [
    header(title),
    context(`${report.range.label} · team total *${fmtHours(total)}*`),
    ...chunk(lines),
  ];
}

export function homeView({ isMember, summary, recentDays, teamReport }) {
  const team = teamReport ? [divider, ...teamBlocks({ period: 'week', report: teamReport, title: 'Team this week' })] : [];
  const tip = context('Hours are measured from your Mac by ActivityWatch and can\'t be edited. `/splot-time devices` shows when your Mac last synced.');

  if (!isMember) {
    return {
      type: 'home',
      blocks: [
        header('SplotTime'),
        section("You're not set up in SplotTime yet. Ask a SplotTime admin to run `/splot-time add @you`."),
        ...team,
      ],
    };
  }
  return {
    type: 'home',
    blocks: [
      header('Your hours'),
      ...periodBlocks(summary),
      divider,
      ...recentDayBlocks(recentDays),
      ...team,
      divider,
      tip,
    ],
  };
}

export const HELP_TEXT = [
  '*SplotTime* measures the hours you work from ActivityWatch on your computer. Nobody can type in or edit hours.',
  '',
  '*Your computer*',
  '`/splot-time connect` gives you a one-line install command for Mac or Windows (one time only)',
  '`/splot-time devices` shows when your computer last synced',
  '`/splot-time disconnect` stops syncing',
  '',
  '*Stats*',
  '`/splot-time stats [@user]` shows weekly, biweekly, monthly, quarterly and yearly totals',
  '`/splot-time history month [@user]` lists the last 12 months (also: day, week, biweek, quarter, year)',
  '`/splot-time team [period] [date]` shows everyone\'s totals',
  '',
  '*Admin*',
  '`/splot-time add @user` / `unassign @user` assign or unassign people (their hours are kept)',
  '`/splot-time users` lists assigned people',
  '`/splot-time status` shows whether everyone\'s computer is syncing',
  '',
  '_You can also send me these as a direct message without `/splot-time`, e.g. `stats`. Weeks run Monday to Sunday._',
].join('\n');
