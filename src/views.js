// Block Kit builders. Pure functions: data in, Slack JSON out.

import { dayLabel, PERIOD_NAMES } from './periods.js';

export const LOG_MODAL_ID = 'splot_time_log';
export const OPEN_LOG_ACTION = 'splot_time_open_log';
export const EDIT_ENTRY_ACTION = 'splot_time_edit_entry';
export const REMOVE_ENTRY_ACTION = 'splot_time_remove_entry';
export const NOTE_MAX_LENGTH = 300;
export const MAX_DAY_HOURS = 24;

export const fmtHours = (h) => `${Number(h.toFixed(2))} h`;

/** Escapes user-written text so it can't trigger mentions like <!channel>. */
export const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const quoteNote = (note) => (note ? `\n> ${escape(note).replaceAll('\n', '\n> ')}` : '');
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
const header = (text) => ({ type: 'header', text: { type: 'plain_text', text } });
const button = (text, actionId, value, extra = {}) => ({
  type: 'button', action_id: actionId, value, text: { type: 'plain_text', text }, ...extra,
});
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

/**
 * One block per recent day. When `editable`, logged days get Edit/Remove
 * buttons and empty days get a Log button.
 */
function recentDayBlocks(recentDays, editable) {
  if (!editable) return [section(`*Recent days*\n${recentDays.map(dayText).join('\n')}`)];

  const blocks = [section('*Recent days*')];
  for (const d of recentDays) {
    if (d.hours == null) {
      blocks.push({ ...section(dayText(d)), accessory: button('Log', EDIT_ENTRY_ACTION, d.day) });
      continue;
    }
    blocks.push(section(dayText(d)), {
      type: 'actions',
      elements: [
        button('Edit', EDIT_ENTRY_ACTION, d.day),
        button('Remove', REMOVE_ENTRY_ACTION, d.day, {
          style: 'danger',
          confirm: {
            title: { type: 'plain_text', text: 'Remove logged hours?' },
            text: { type: 'mrkdwn', text: `This deletes your ${fmtHours(d.hours)} and comment for ${dayLabel(d.day, true)}.` },
            confirm: { type: 'plain_text', text: 'Remove' },
            deny: { type: 'plain_text', text: 'Cancel' },
            style: 'danger',
          },
        }),
      ],
    });
  }
  return blocks;
}

/** Stats for every period type, plus the last few days. */
export function summaryBlocks({ title, userId, summary, recentDays }) {
  const blocks = [header(title)];
  if (userId) blocks.push(context(`Stats for <@${userId}>`));
  blocks.push(...periodBlocks(summary));
  if (recentDays?.length) blocks.push(divider, ...recentDayBlocks(recentDays, false));
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

export function logModal({ initialDate, initialHours, initialNote }) {
  return {
    type: 'modal',
    callback_id: LOG_MODAL_ID,
    title: { type: 'plain_text', text: 'SplotTime' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      section('Log the hours you worked on a day. Logging the same day again replaces the old entry.'),
      {
        type: 'input',
        block_id: 'day',
        label: { type: 'plain_text', text: 'Day' },
        element: { type: 'datepicker', action_id: 'date', initial_date: initialDate },
      },
      {
        type: 'input',
        block_id: 'hours',
        label: { type: 'plain_text', text: 'Hours worked' },
        element: {
          type: 'number_input',
          action_id: 'value',
          is_decimal_allowed: true,
          min_value: '0',
          max_value: String(MAX_DAY_HOURS),
          ...(initialHours != null && { initial_value: String(initialHours) }),
          placeholder: { type: 'plain_text', text: 'e.g. 8' },
        },
      },
      {
        type: 'input',
        block_id: 'note',
        optional: true,
        label: { type: 'plain_text', text: 'What did you work on?' },
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          multiline: true,
          max_length: NOTE_MAX_LENGTH,
          ...(initialNote && { initial_value: initialNote }),
          placeholder: { type: 'plain_text', text: 'e.g. Checkout redesign, client calls' },
        },
      },
    ],
  };
}

export function homeView({ isMember, summary, recentDays, teamReport }) {
  const team = teamReport ? [divider, ...teamBlocks({ period: 'week', report: teamReport, title: 'Team this week' })] : [];
  const tip = context('`/splot-time log 8 what you worked on` logs today from any channel. `/splot-time help` lists every command.');

  if (!isMember) {
    return {
      type: 'home',
      blocks: [
        header('SplotTime'),
        section("You're not set up to log hours yet. Ask a SplotTime admin to run `/splot-time add @you`."),
        ...team,
      ],
    };
  }
  return {
    type: 'home',
    blocks: [
      header('Your hours'),
      { type: 'actions', elements: [button('Log hours', OPEN_LOG_ACTION, 'today', { style: 'primary' })] },
      ...periodBlocks(summary),
      divider,
      ...recentDayBlocks(recentDays, true),
      ...team,
      divider,
      tip,
    ],
  };
}

export const HELP_TEXT = [
  '*SplotTime* tracks the hours you work each day.',
  '',
  '*Logging*',
  '`/splot-time` opens the logging form',
  '`/splot-time log 8` sets today to 8 h (`/splot-time 8` works too)',
  '`/splot-time log 8 Checkout redesign, client calls` adds a comment',
  '`/splot-time log 6 yesterday [comment]` logs yesterday',
  '`/splot-time log 7.5 fri [comment]` logs the most recent Friday (mon … sun)',
  '`/splot-time log 8 2026-09-14 [comment]` logs a specific date',
  '`/splot-time remove [yesterday | fri | YYYY-MM-DD]` deletes a day\'s entry (today if no day)',
  'The SplotTime *Home* tab has Edit and Remove buttons for your recent days.',
  '',
  '*Stats*',
  '`/splot-time stats [@user]` shows weekly, biweekly, monthly, quarterly and yearly totals',
  '`/splot-time history month [@user]` lists the last 12 months (also: day, week, biweek, quarter, year)',
  '`/splot-time team [period] [date]` shows everyone\'s totals, plus comments for `day` and `week`',
  '',
  '*Admin*',
  '`/splot-time add @user` / `unassign @user` assign or unassign people (their hours are kept)',
  '`/splot-time users` lists assigned people',
  '',
  '_You can also send me these as a direct message without `/splot-time`, e.g. `8 Checkout redesign` or `stats`. Weeks run Monday to Sunday._',
].join('\n');
