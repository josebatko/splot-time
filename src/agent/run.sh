#!/bin/sh
# SplotTime launcher. This file never changes after install: each run it fetches
# the current sync script from the server, so fixes reach every Mac on their own.
# A download that fails or looks broken is ignored and the last good copy runs.
S='__SERVER__'
D="$HOME/Library/Application Support/SplotTime"
if curl -fsS -m 30 -o "$D/sync.new" "$S/agent/sync.sh" &&
   [ "$(tail -n 1 "$D/sync.new")" = '# end of SplotTime sync' ] && sh -n "$D/sync.new"; then
  chmod 700 "$D/sync.new" && mv -f "$D/sync.new" "$D/sync.sh"
else
  rm -f "$D/sync.new"
fi
exec /bin/sh "$D/sync.sh"
