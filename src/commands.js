// Parses `/splot-time ...` text and decides what to do. Returns
// { text, blocks? }, a reply only the user sees. Hours are never typed in:
// they come only from each person's Mac (see companion.js).

import { dayLabel, isValidDate, parsePeriod, resolveDay } from './periods.js';
import * as stats from './stats.js';
import { historyBlocks, summaryBlocks, teamBlocks, HELP_TEXT } from './views.js';

const MENTION_RE = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g;
const HOURS_RE = /^\d+(?:[.,]\d+)?$/;

export function mentions(text) {
  return [...text.matchAll(MENTION_RE)].map((m) => m[1]);
}

/** Admins can always log; everyone else has to be assigned. */
export function canLog(ctx, userId) {
  return ctx.admins.has(userId) || ctx.db.isMember(userId);
}

const MEASURED_ONLY = 'Hours are measured automatically from your Mac and can\'t be entered or changed by hand. If your Mac isn\'t connected yet, run `/splot-time connect`.';

export function handleCommand(ctx, userId, rawText) {
  const { db, admins } = ctx;
  const now = ctx.now();
  const isAdmin = admins.has(userId);
  const allowed = canLog(ctx, userId);
  const users = mentions(rawText);
  // Original-case words, so comments keep their capitalisation.
  const words = rawText.replace(MENTION_RE, ' ').trim().split(/\s+/).filter(Boolean);
  const sub = words[0]?.toLowerCase();
  const args = words.slice(1).map((w) => w.toLowerCase());

  const notAssigned = { text: "You're not set up in SplotTime yet. Ask an admin to run `/splot-time add @you`." };
  const adminOnly = { text: 'Only SplotTime admins can do that.' };
  const targetUser = users[0] ?? userId;

  switch (sub) {
    case 'log':
    case 'remove':
    case 'delete':
    case 'clear':
      return { text: MEASURED_ONLY };

    case undefined:
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
        return db.removeMember(u) ? `:heavy_minus_sign: Unassigned <@${u}> (their recorded hours are kept)` : `<@${u}> wasn't assigned`;
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
      if (HOURS_RE.test(sub)) return { text: MEASURED_ONLY };
      return { text: `I don't know \`${sub}\`.\n\n${HELP_TEXT}` };
  }
}
