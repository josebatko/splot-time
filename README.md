# SplotTime

A Slack app that records work hours measured by ActivityWatch on each person's Mac or Windows PC. Nobody can type in or edit hours. Everyone can see weekly, biweekly, monthly, quarterly and yearly totals.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/splot-time connect` | members | One-line install command for Mac or Windows |
| `/splot-time devices` | members | When your computer last synced |
| `/splot-time disconnect` | members | Stops accepting data from your computer |
| `/splot-time stats [@user]` | anyone | Current and previous totals for all five periods, plus the last 7 days (also just `/splot-time`) |
| `/splot-time history month [@user]` | anyone | Last 12 periods (`week`, `biweek`, `month`, `quarter`, `year`), or the last 14 days with `day` |
| `/splot-time team [period] [date]` | anyone | Everyone's totals |
| `/splot-time users` | anyone | List assigned people |
| `/splot-time add @user …` / `unassign @user …` | admins | Assign or unassign people (unassigning keeps their hours) |
| `/splot-time help` | anyone | Command list |

The same commands work as direct messages to the app, minus `/splot-time`. The **Home tab** shows your stats, your last 7 days and the team's week. There is no way to log, edit or remove hours, for admins either.

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

Any always-on host with Node 22 and a persistent disk works, such as a small VPS, Fly.io or Railway with a volume. Point `DATABASE_PATH` at the persistent volume, since all data lives in one SQLite file. Use the SQLite online backup tool in `tools/backup.js`; copying a live WAL database file alone is unsafe. Set `TZ` to your team's timezone; it decides what "today" means.

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
  classify.js  What counts as work in ActivityWatch data
  companion.js Mac sync endpoints and storage
  install-script.js  Serves the installers in agent/ (Mac and Windows)
```


## Automatic hours from ActivityWatch

There is no SplotTime app to install or update. Each person runs
`/splot-time connect` once and pastes the command it prints: into Terminal on a
Mac, or into Win + R on Windows. That installs a small curl script
(`src/agent/`) that launchd or Task Scheduler runs at login and every hour. Each run asks
ActivityWatch for the last seven days of foreground windows, already clipped to
not-idle time, and sends them to the server. A Mac that was closed for a while
catches up on its next run, and closing Terminal changes nothing.

Nothing on a computer ever needs reinstalling. The scheduler starts a tiny
launcher (`agent/run.*`) that never changes; each run it downloads the current
sync script from `/agent/sync.sh` or `/agent/sync.ps1` and keeps the last good
copy if the download fails or looks broken. The server also decides what counts
as work (`src/classify.js`). So any fix, to the rules or to the sync script, is a
server deploy and reaches every computer within the hour. Because the server can
change what runs on everyone's computer, keep its deploy access tight. Window titles and URLs are classified in
memory and thrown away; only start/end times per day are stored.


| Command | What it does |
|---|---|
If a connected Mac sends nothing for two days, the app sends its owner one DM
explaining what to check. Requirements: macOS or Windows 10/11 with
[ActivityWatch](https://activitywatch.net/downloads/) installed, and
`COMPANION_PUBLIC_URL` set on the server. Colleague setup: [docs/install.md](docs/install.md). See [docs/classification.md](docs/classification.md)
and [docs/ovh.md](docs/ovh.md).
