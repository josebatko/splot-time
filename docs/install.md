# Installing SplotTime

SplotTime records your work hours from ActivityWatch on your computer. You install
it once; after that it runs in the background and updates itself. Hours can't be
typed in or edited.

## Admin, once before anyone installs

1. Deploy the server (see [ovh.md](ovh.md)) and check that both of these load in a browser:
   - `https://crm.usesplot.com/splot-time/healthz` shows `{"ok":true}`
   - `https://crm.usesplot.com/splot-time/install.sh` shows a script
2. In Slack, add everyone: `/splot-time add @name @name …`
3. Send each person this page.
4. Watch progress with `/splot-time status`: everyone you added, their computer,
   when it last synced and any error it reported. Admins also get a DM at 9 every
   morning listing anyone who isn't syncing.

## Mac

1. **Install ActivityWatch.** Download the macOS version from
   <https://activitywatch.net/downloads/>, drag it to Applications and open it.
   macOS asks for **Accessibility** access for ActivityWatch: allow it in
   System Settings → Privacy & Security → Accessibility. Without it, window titles
   are missing and most work won't count.
2. **Start ActivityWatch at login.** System Settings → General → Login Items → `+` →
   ActivityWatch.
3. **Connect.** In Slack run `/splot-time connect`. Open Terminal (⌘ Space, type
   Terminal, Return), paste the *Mac* command and press Return. It removes any old
   SplotTime app and its settings, installs the background sync, and runs a first
   sync. Wait for **Done**, then close Terminal.
4. **Allow browser access.** The first time Chrome or Safari is in front,
   macOS asks whether ActivityWatch may control it. Click **Allow**, which lets it read
   the page address.
5. A **Background Items Added** notice may appear. Leave it switched on.

## Windows

1. **Install ActivityWatch.** Download the Windows installer from
   <https://activitywatch.net/downloads/> and run it. If Windows SmartScreen
   warns, click *More info* → *Run anyway*. Tick the option to start at login if
   the installer offers it, then open ActivityWatch once.
2. **Connect.** In Slack run `/splot-time connect`. Press **Win + R**, paste the
   *Windows* command and press Return. A PowerShell window removes any old
   SplotTime app, installs the hourly sync and runs a first sync. Wait for
   **Done**, then close the window.

## Check it worked

- In Slack, `/splot-time devices` should say *last synced less than an hour ago*.
- `/splot-time stats` shows today's hours, which fill in during the day.

If a computer stops sending data for two days, SplotTime sends its owner a Slack
DM saying what to check.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `devices` says *not synced yet* | ActivityWatch isn't running or isn't installed. Open it, wait an hour. |
| *ActivityWatch has no data yet* | Open ActivityWatch once and use the computer for a few minutes. |
| *no longer connected* | Someone ran `/splot-time connect` again. Paste the newest command. |
| Hours look low (Mac) | Accessibility permission for ActivityWatch is off (step 1). |
| New computer | Run `/splot-time connect` on it. The old computer stops being counted. |

The status of the last sync is in a file: on Mac
`~/Library/Application Support/SplotTime/last-sync`, on Windows
`%LOCALAPPDATA%\SplotTime\last-sync`.

## Removing SplotTime

- **Slack:** `/splot-time disconnect`
- **Mac:** `launchctl bootout gui/$(id -u)/com.splot.time.sync; rm -rf ~/Library/LaunchAgents/com.splot.time.sync.plist ~/Library/Application\ Support/SplotTime`
- **Windows (PowerShell):** `Unregister-ScheduledTask 'SplotTime sync' -Confirm:$false; Remove-Item -Recurse $env:LOCALAPPDATA\SplotTime`
