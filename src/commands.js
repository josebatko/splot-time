// Parses `/splot-time ...` text and decides what to do. Returns one of:
//   { modal: true }                    open the logging form
//   { text, blocks?, changed? }        reply to the user (only they see it);
//                                      `changed` means their hours changed

import { dayLabel, isValidDate, parsePeriod, resolveDay } from './periods.js';
import * as stats from './stats.js';
import { escape, fmtHours, historyBlocks, summaryBlocks, teamBlocks, HELP_TEXT, MAX_DAY_HOURS, NOTE_MAX_LENGTH } from './views.js';

const MENTION_RE = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g;
const HOURS_RE = /^\d+(?:[.,]\d+)?$/;

export function mentions(text) {
  return [...text.matchAll(MENTION_RE)].map((m) => m[1]);
}

export function validateHours(raw) {
  if (!HOURS_RE.test(String(raw ?? '').trim())) return { error: 'Hours must be a number, e.g. `40` or `37.5`.' };
  const hours = Number(String(raw).trim().replace(',', '.'));
  if (hours > MAX_DAY_HOURS) return { error: `A day only has ${MAX_DAY_HOURS} hours.` };
  return { hours };
}

/** Trims a comment; empty becomes null. */
export function cleanNote(raw) {
  const note = String(raw ?? '').trim();
  if (note.length > NOTE_MAX_LENGTH) return { error: `Keep the comment under ${NOTE_MAX_LENGTH} characters.` };
  return { note: note || null };
}

/**
 * Saves hours (and optionally a comment) for a day and returns the confirmation
 * text. Shared by the command and the form. `note` undefined keeps the old comment.
 */
export function logHours(ctx, userId, day, hours, note) {
  if (day > ctx.now()) return { error: "You can't log hours for a future day." };
  const previous = ctx.db.setHours(userId, day, hours, note);
  const was = previous == null || previous === hours ? '' : ` (was ${fmtHours(previous)})`;
  const comment = note ? `\n> ${escape(note)}` : '';
  return { text: `:white_check_mark: Logged *${fmtHours(hours)}* for ${dayLabel(day, true)}${was}.${comment}` };
}

export function removeHours(ctx, userId, day) {
  return ctx.db.deleteHours(userId, day)
    ? { text: `:wastebasket: Removed your hours for ${dayLabel(day, true)}.`, changed: true }
    : { text: `Nothing was logged for ${dayLabel(day, true)}.` };
}

/** Admins can always log; everyone else has to be assigned. */
export function canLog(ctx, userId) {
  return ctx.admins.has(userId) || ctx.db.isMember(userId);
}

export function handleCommand(ctx, userId, rawText) {
  const { db, admins } = ctx;
  const now = ctx.now();
  const isAdmin = admins.has(userId);
  const allowed = canLog(ctx, userId);
  const users = mentions(rawText);
  // Original-case words, so comments keep their capitalisation.
  let words = rawText.replace(MENTION_RE, ' ').trim().split(/\s+/).filter(Boolean);
  // `/splot-time 40` is shorthand for `/splot-time log 40`.
  if (words[0] && HOURS_RE.test(words[0])) words = ['log', ...words];
  const sub = words[0]?.toLowerCase();
  const args = words.slice(1).map((w) => w.toLowerCase());

  const notAssigned = { text: "You're not set up in SplotTime yet. Ask an admin to run `/splot-time add @you`." };
  const adminOnly = { text: 'Only SplotTime admins can do that.' };
  const targetUser = users[0] ?? userId;

  switch (sub) {
    case undefined:
      if (!allowed) return notAssigned;
      return { modal: true };

    case 'log': {
      if (!allowed) return notAssigned;
      const { hours, error } = validateHours(args[0]);
      if (error) return { text: `${error} Usage: \`/splot-time log 8 [yesterday | mon | YYYY-MM-DD] [comment]\`` };
      // An optional day word comes next; everything after it is the comment.
      const explicitDay = resolveDay(args[1], now);
      const day = explicitDay ?? now;
      const noteWords = words.slice(explicitDay ? 3 : 2);
      const { note, error: noteError } = cleanNote(noteWords.join(' '));
      if (noteError) return { text: noteError };
      const result = logHours(ctx, userId, day, hours, noteWords.length ? note : undefined);
      return { text: result.error ?? result.text, changed: !result.error };
    }

    case 'remove':
    case 'delete':
    case 'clear': {
      if (users.length) return { text: 'To unassign someone, use `/splot-time unassign @user`.' };
      if (!allowed) return notAssigned;
      const day = args[0] ? resolveDay(args[0], now) : now;
      if (!day) return { text: 'Usage: `/splot-time remove [yesterday | mon | YYYY-MM-DD]` (defaults to today)' };
      return removeHours(ctx, userId, day);
    }

    case 'stats':
    case 'me': {
      if (!users.length && !allowed) return notAssigned;
      const blocks = summaryBlocks({
        title: 'SplotTime stats',
        userId: targetUser,
        summary: stats.summary(db, targetUser, now, ctx.anchor),
        recentDays: stats.recentDays(db, targetUser, now),
      });
      return { text: 'SplotTime stats', blocks };
    }

    case 'history': {
      const period = parsePeriod(args[0] ?? 'month');
      if (!period) return { text: 'Usage: `/splot-time history [day | week | biweek | month | quarter | year] [@user]`' };
      if (!users.length && !allowed) return notAssigned;
      const rows = stats.history(db, targetUser, period, now, ctx.anchor);
      return { text: 'SplotTime history', blocks: historyBlocks({ userId: targetUser, period, rows }) };
    }

    case 'team': {
      // Period and date can come in either order, and both are optional.
      const period = parsePeriod(args.find((a) => !isValidDate(a)) ?? 'week');
      const date = args.find(isValidDate) ?? now;
      if (!period || args.length > 2) return { text: 'Usage: `/splot-time team [day | week | biweek | month | quarter | year] [YYYY-MM-DD]`' };
      const report = stats.team(db, db.listMembers(), period, date, ctx.anchor);
      return { text: 'SplotTime team report', blocks: teamBlocks({ period, report }) };
    }

    case 'add':
    case 'unassign': {
      if (!isAdmin) return adminOnly;
      if (users.length === 0) return { text: `Usage: \`/splot-time ${sub} @user\` (you can mention several people).` };
      const lines = users.map((u) => {
        if (sub === 'add') return db.addMember(u, userId) ? `:heavy_plus_sign: Added <@${u}>` : `<@${u}> is already assigned`;
        return db.removeMember(u) ? `:heavy_minus_sign: Unassigned <@${u}> (their logged hours are kept)` : `<@${u}> wasn't assigned`;
      });
      return { text: lines.join('\n') };
    }

    case 'users':
    case 'members': {
      const members = db.listMembers();
      return {
        text: members.length
          ? `*Assigned people (${members.length})*\n${members.map((u) => `• <@${u}>`).join('\n')}`
          : 'Nobody is assigned yet. Admins can use `/splot-time add @user`.',
      };
    }

    case 'help':
      return { text: HELP_TEXT };

    default:
      return { text: `I don't know \`${sub}\`.\n\n${HELP_TEXT}` };
  }
}
