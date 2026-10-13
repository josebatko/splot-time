#!/bin/zsh
# Read-only local diagnostics. Never print the setup URL, bearer token or event data.
set -eu
umask 077
app_plist='/Applications/SplotTime.app/Contents/Info.plist'
data_dir="$HOME/Library/Application Support/SplotTime"
failures=0
report() { /usr/bin/printf '%s: %s\n' "$1" "$2"; }
if [[ ! -f "$app_plist" ]]; then report 'SplotTime' 'not installed'; exit 1; fi
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_plist")
report 'Installed version' "$version"
[[ "$version" == '0.4.1' ]] || failures=$((failures+1))
if /bin/launchctl print "gui/$(/usr/bin/id -u)/com.splot.time.companion" 2>/dev/null | /usr/bin/grep -q 'state = running'; then
 report 'Background job' 'running'
else
 report 'Background job' 'not running'; failures=$((failures+1))
fi
if /usr/bin/curl --silent --fail --max-time 5 --noproxy '*' 'http://127.0.0.1:5600/api/0/buckets/' >/dev/null; then
 report 'ActivityWatch' 'reachable (watcher freshness still needs verification)'
else
 report 'ActivityWatch' 'unreachable'; failures=$((failures+1))
fi
if [[ ! -f "$data_dir/local-url" ]]; then report 'Local status' 'no setup URL'; exit 1; fi
setup_url=$(<"$data_dir/local-url")
if [[ ! "$setup_url" =~ '^http://127\.0\.0\.1:[0-9]+/#[A-Za-z0-9_-]+$' ]]; then
 report 'Local status' 'unexpected URL format; refusing request'; exit 1
fi
local_base=${setup_url%%\#*}
local_token=${setup_url#*\#}
temp_dir=$(/usr/bin/mktemp -d /private/tmp/splot-check.XXXXXX)
trap '/bin/rm -rf -- "$temp_dir"' EXIT
# Pass the credential over stdin, not visible command arguments. Never follow redirects.
if ! /usr/bin/printf 'url = "%sstatus"\nheader = "Authorization: Bearer %s"\n' "$local_base" "$local_token" |
 /usr/bin/curl --config - --silent --fail --max-time 10 --noproxy '*' --proto '=http' --output "$temp_dir/status.json"; then
 report 'Local status' 'unavailable; app may be stopped or URL stale'; exit 1
fi
unset setup_url local_token
field() { /usr/bin/plutil -extract "$1" raw -o - "$temp_dir/status.json" 2>/dev/null || /usr/bin/printf 'unavailable'; }
policy_value=$(field config.policy)
auto_value=$(field config.automatic)
login_value=$(field config.startAtLogin)
state_value=$(field status.state)
pending_value=$(field status.pending)
phone_value=$(field status.iphone)
last_value=$(field status.lastUpload)
identity_value=$(field config.deviceId)
report 'Policy' "$policy_value"
report 'Automatic mode' "$auto_value"
report 'Start at login' "$login_value"
report 'Capture state' "$state_value"
report 'Pending uploads' "$pending_value"
report 'iPhone status' "$phone_value"
if [[ -n "$identity_value" && "$identity_value" != unavailable && "$identity_value" != null ]]; then report 'Paired' 'yes'; else report 'Paired' 'no'; failures=$((failures+1)); fi
unset identity_value
[[ "$policy_value" == 'splot-context-v1' && "$auto_value" == true && "$login_value" == true && "$state_value" == running && "$pending_value" == 0 ]] || failures=$((failures+1))
last_seconds=${last_value%%.*}
if [[ "$last_seconds" =~ '^[0-9]+$' ]]; then
 age=$(( $(/bin/date +%s) - last_seconds ))
 report 'Seconds since last successful upload' "$age"
 (( age >= 0 && age <= 300 )) || failures=$((failures+1))
else
 report 'Last successful upload' 'not yet recorded'; failures=$((failures+1))
fi
if (( failures > 0 )); then
 report 'Result' 'incomplete; consult AGENTS.md (a new install may need one capture cycle)'; exit 1
fi
report 'Result' 'common Mac checks passed; browser context, Slack identity and phone capture require separate verification'
