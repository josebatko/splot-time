# OVH deployment

The service is isolated from CRM and other Slack applications. Source lives at
`/opt/splot-time` on OVH. Data lives at `/var/lib/splot-time`. The Node 22 container
runs without root, has a read-only root filesystem and binds only to loopback.
Traefik supplies public HTTPS through the existing `coolify` network.

Server secrets: `/etc/splot-time/secrets.env`, root only, mode 600.
Local secrets: `~/firma/projects/splot-time/.env`, owner only, ignored by Git.
Fill both Slack tokens, ADMIN_USER_IDS and COMPANION_PUBLIC_URL in the local file.
Use the SplotTime Slack app's tokens, not credentials from another app.
The deployed endpoint is https://crm.usesplot.com/splot-time. It reuses the
existing OVH hostname and TLS certificate. Traefik strips the /splot-time prefix
before forwarding requests; existing CRM and WhatsApp routes remain separate. Do not run two copies of this Slack app during migration.

After filling the local file, run `~/firma/projects/splot-time/tools/sync-secrets.sh`. It transfers the file over SSH without printing its contents and activates the service. To activate directly on OVH, run:

```
sudo /opt/splot-time/deploy/activate.sh
```

The activation script validates required fields without printing secrets, installs
an HTTPS route, starts the service and enables daily SQLite online backups. It
stops before activation if configuration is missing. The HTTP port is never
published directly. Confirm the HTTPS `/healthz` and `/install.sh` endpoints and `/splot-time connect`
in Slack after activation. Health checks measure HTTP liveness, not Slack delivery.

Backups are verified by SQLite integrity checks and stored at
`/var/lib/splot-time/backups`. These are local backups only. Off-host replication,
restore exercises and retention must be configured before claiming disaster
recovery. The timer is intentionally disabled until the app is activated.

Rollback: stop this service with its Compose file and remove only the
`splot-time.yaml` proxy route. Preserve the data directory and secrets file.

There is no Mac app to sign or update. Macs run the curl script served at
`/install.sh`; the work rules and the ActivityWatch query come from this server.
The only automatic message is one DM to a person whose connected Mac has sent
nothing for two days.

## Verified deployment, 2026-10-12

The service is running on OVH with supplied Slack credentials. The public
/splot-time/healthz endpoint returns JSON with ok=true. The database is
/var/lib/splot-time/splot-time.db on OVH, mounted at /data in the container.
The private local .env file is a configuration transfer file, not a database.
A live SQLite online backup passed its integrity check. Local Mac queues and
ActivityWatch history are separate from the central team database.
