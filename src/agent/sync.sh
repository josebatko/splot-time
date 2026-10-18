#!/bin/sh
# SplotTime sync. Reads ActivityWatch on this Mac and sends it to the team server.
S='__SERVER__'
D="$HOME/Library/Application Support/SplotTime"
AW='http://127.0.0.1:5600/api/0'
J='Content-Type: application/json'
C='X-SplotTime-Client: mac'
# Failures are also reported to the server, so admins see them in /splot-time status.
fail() {
  printf 'failed: %s\n' "$1" > "$D/last-sync"
  printf '{"message":"%s"}' "$1" | curl -fs -m 15 -H @"$D/auth" -H "$J" -H "$C" --data-binary @- -o /dev/null "$S/v1/status"
  exit 1
}
# One run at a time. A lock left by a run that was killed expires after 15 minutes.
find "$D/lock" -maxdepth 0 -mmin +15 -exec rmdir {} \; 2>/dev/null
mkdir "$D/lock" 2>/dev/null || exit 0
trap 'rmdir "$D/lock"' EXIT
if ! curl -fsS -m 5 "$AW/info" >/dev/null 2>&1; then
  open -g -a ActivityWatch 2>/dev/null || fail 'ActivityWatch is not installed'
  i=0
  until curl -fsS -m 5 "$AW/info" >/dev/null 2>&1; do
    i=$((i+1)); [ "$i" -ge 24 ] && fail 'ActivityWatch did not start'; sleep 5
  done
fi
buckets=$(curl -fsS -m 30 "$AW/buckets/") || fail 'could not read ActivityWatch'
query=$(printf '%s' "$buckets" | curl -sS -m 60 -H @"$D/auth" -H "$J" -H "$C" --data-binary @- -w '\n%{http_code}' "$S/v1/query") || fail 'could not reach the SplotTime server'
code=$(printf '%s' "$query" | tail -n 1); query=$(printf '%s' "$query" | sed '$d')
case "$code" in
  200) ;;
  401) fail 'this Mac is no longer connected, run /splot-time connect in Slack again' ;;
  409) fail 'ActivityWatch has no window and idle data yet' ;;
  *) fail "SplotTime server error $code" ;;
esac
result=$(printf '%s' "$query" | curl -fsS -m 300 -H "$J" --data-binary @- "$AW/query/") || fail 'ActivityWatch query failed'
printf '%s' "$result" | curl -fsS -m 300 -H @"$D/auth" -H "$J" -H "$C" --data-binary @- -o /dev/null "$S/v1/activity" || fail 'upload failed'
printf 'ok %s\n' "$(date)" > "$D/last-sync"
# end of SplotTime sync
