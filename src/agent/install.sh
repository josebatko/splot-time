#!/bin/sh
# SplotTime installer. Usage: curl -fsSL <server>/install.sh | sh -s -- <token from /splot-time connect>
set -eu
T="${1:-}"
[ -n "$T" ] || { echo 'Copy the full command from /splot-time connect in Slack.'; exit 1; }
[ "$(uname)" = Darwin ] || { echo 'SplotTime sync runs on macOS.'; exit 1; }
D="$HOME/Library/Application Support/SplotTime"
P="$HOME/Library/LaunchAgents/com.splot.time.sync.plist"
U=$(id -u)
umask 077
mkdir -p "$D" "$HOME/Library/LaunchAgents"

# Retire the old SplotTime app's background job. ActivityWatch keeps all history.
launchctl bootout "gui/$U/com.splot.time.companion" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.splot.time.companion.plist"
pkill -x SplotTime 2>/dev/null || true
security delete-generic-password -s com.splot.time.companion >/dev/null 2>&1 || true
rm -rf /Applications/SplotTime.app "$HOME/Applications/SplotTime.app" 2>/dev/null || true
(cd "$D" && rm -f config*.json config.tmp queue.sqlite3* local-url instance.lock)

printf 'Authorization: Bearer %s\n' "$T" > "$D/auth"
cat > "$D/run.sh" <<'SPLOT_RUN'
__RUN__
SPLOT_RUN
cat > "$D/sync.sh" <<'SPLOT_SYNC'
__SYNC__
SPLOT_SYNC
chmod 700 "$D/run.sh" "$D/sync.sh"
rm -f "$D/last-sync"

cat > "$P" <<SPLOT_PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.splot.time.sync</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$D/run.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>$D/sync-errors.log</string>
</dict></plist>
SPLOT_PLIST
launchctl bootout "gui/$U/com.splot.time.sync" 2>/dev/null || true
launchctl bootstrap "gui/$U" "$P"

if [ ! -d /Applications/ActivityWatch.app ] && [ ! -d "$HOME/Applications/ActivityWatch.app" ]; then
  echo 'SplotTime is installed. One step left: install ActivityWatch (opening the download page).'
  echo 'Once it is in Applications, SplotTime picks it up within the hour. Nothing else to do.'
  open 'https://activitywatch.net/downloads/'
  exit 0
fi
echo 'Checking the first sync...'
i=0
while [ ! -f "$D/last-sync" ] && [ "$i" -lt 150 ]; do sleep 2; i=$((i+1)); done
case "$(cat "$D/last-sync" 2>/dev/null)" in
  ok*) echo 'Done. SplotTime now syncs every hour in the background, also after restarts. You can close this window.' ;;
  failed*) echo "Installed, but the first sync $(cat "$D/last-sync"). It retries every hour." ;;
  *) echo 'Installed. The first sync is still running; it retries every hour. You can close this window.' ;;
esac
