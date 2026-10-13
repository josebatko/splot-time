#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test -f "$root/.env" || { echo 'Fill the private .env file first.' >&2; exit 1; }
chmod 600 "$root/.env"
# Standard input avoids remote temporary files and keeps values out of arguments/logs.
ssh splot-ovh 'sudo -n python3 -c '\''import os,sys; p="/etc/splot-time/secrets.env"; fd=os.open(p+".pending",os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600); os.fchmod(fd,0o600); f=os.fdopen(fd,"wb"); f.write(sys.stdin.buffer.read()); f.close(); os.replace(p+".pending",p)'\''' < "$root/.env"
ssh splot-ovh 'sudo -n /opt/splot-time/deploy/activate.sh'
