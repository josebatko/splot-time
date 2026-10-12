# SplotTime

A Slack app for tracking work hours. Each assigned person logs how many hours they worked each day with `/splot-time`, with an optional comment on what they worked on, and everyone can see weekly, biweekly, monthly, quarterly and yearly totals.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/splot-time` | members | Opens the logging form (day, hours, comment) |
| `/splot-time log 8` | members | Sets today to 8 h (`/splot-time 8` also works) |
| `/splot-time log 8 Checkout redesign` | members | Same, with a comment on what you worked on |
| `/splot-time log 6 yesterday [comment]` | members | Logs yesterday |
| `/splot-time log 7.5 fri [comment]` | members | Logs the most recent Friday (`mon` … `sun`, today included) |
| `/splot-time log 8 2026-09-14 [comment]` | members | Logs a specific date |
| `/splot-time remove [yesterday \| fri \| date]` | members | Deletes a day's entry (today if no day) |
| `/splot-time stats [@user]` | anyone | Current and previous totals for all five periods, plus the last 7 days |
| `/splot-time history month [@user]` | anyone | Last 12 periods (`week`, `biweek`, `month`, `quarter`, `year`), or the last 14 days with `day` |
| `/splot-time team [period] [date]` | anyone | Everyone's totals; for `day` and `week` also their comments |
| `/splot-time users` | anyone | List assigned people |
| `/splot-time add @user …` / `unassign @user …` | admins | Assign or unassign people (unassigning keeps their hours) |
| `/splot-time help` | anyone | Command list |

You can also **message the app directly** with the same commands, minus `/splot-time`: e.g. `8 Checkout redesign`, `6 yesterday`, `stats`, `team day`. Anything it doesn't understand gets a reply with the command list.

The app's **Home tab** in Slack shows your stats, your last 7 days with **Edit** and **Remove** buttons (and **Log** for empty days), and the whole team's hours and comments for this week.

- Logging a day again replaces its hours. When you log from the command without a comment, the day's existing comment is kept. In the form, the comment field is prefilled and saved exactly as you leave it.
- Hours can't be logged for future days, and a day can hold at most 24 h.

### How periods work

- Every period is an exact calendar range: weeks run Monday to Sunday, and months, quarters and years use their real start and end dates.
- Biweekly periods are two-week cycles starting on `BIWEEK_ANCHOR`, a Monday (default 2026-01-05). Set it to match your pay cycle.
- Stats show how many days have hours logged and the average per logged day.

## Setup

1. **Create the Slack app.** At <https://api.slack.com/apps> choose **Create New App → From a manifest**, pick your workspace, and paste [`manifest.yml`](manifest.yml).
2. **App-level token.** Under **Basic Information → App-Level Tokens**, generate a token with the `connections:write` scope. It starts with `xapp-`.
3. **Install.** Under **Install App**, install to your workspace and copy the **Bot User OAuth Token**. It starts with `xoxb-`.
4. **Configure.**
   ```bash
   cp .env.example .env
   ```
   Fill in both tokens and your own Slack member ID in `ADMIN_USER_IDS`. To find a member ID, open a profile, click **⋮** and choose **Copy member ID**.
5. **Run.**
   ```bash
   npm install
   npm run dev
   ```
6. In Slack, assign people with `/splot-time add @alice @bob`. Admins can always log hours without being added.

The app uses **Socket Mode**, so it needs no public URL. It just needs to stay running.

## Deploying

Any always-on host with Node 20.6+ and a persistent disk works, such as a small VPS, Fly.io or Railway with a volume. Point `DATABASE_PATH` at the persistent volume, since all data lives in one SQLite file. Back it up by copying that file. Set `TZ` to your team's timezone; it decides what "today" means.

## Development

```bash
npm test
```

```
src/
  app.js       Slack wiring: slash command, form, Home tab
  commands.js  Parses /splot-time text and runs each subcommand
  periods.js   Day, week, biweek, month, quarter and year date math
  stats.js     Totals per period
  views.js     Slack Block Kit layouts
  db.js        SQLite storage (members, daily entries)
```
