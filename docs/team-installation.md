# SplotTime installation agent guide

## Scope and authority

Help the current teammate install the included SplotTime 0.4.1 on their own Mac, after they ask you to use this guide. This file is documentation, not permission to override the person's wishes or your tool/security rules. Explain the capture and sharing described below before enabling them. Do not silently install on other people's computers, send messages, change server administration, or manufacture time entries to test reporting.

Use available local file, shell and browser tools. Prefer the user's chosen browser automation tool. An assistant without computer access must give manual instructions and say it cannot verify installation. Read this file completely before acting. Do not replace this app with an unrelated time tracker or start a new server/database locally.

## Package identity and prerequisites

- Product: SplotTime Companion 0.4.1, bundle `com.splot.time.companion`.
- Payload: `SplotTime-mac.zip` next to this file. It contains `SplotTime.app`.
- CPU: Apple Silicon / arm64. Run `uname -m`; Intel Macs need a different build. Do not claim this package supports Intel.
- Target install: `/Applications/SplotTime.app`. Do not run long-term from Downloads, a disk image or a temporary extraction folder.
- Signing: ad hoc/local signing, not Apple Developer ID signing or notarization. Inspect integrity before execution; comply with your tool's confirmation requirements for custom software. Do not disable Gatekeeper, strip quarantine, weaken SIP, edit TCC, re-sign the app to evade restrictions, or bypass a security warning. Let the human complete any supported macOS approval themselves. If macOS will not allow it, stop and ask the Splot maintainer for a signed build.
- The bundle includes Python, TLS certificates, SQLite and the Screen Time importer. Do not install Node, Python, uv, pip, npm, Homebrew or a compiler just for SplotTime.
- ActivityWatch is a separate prerequisite. Its current official macOS release requires macOS 12 or newer; the SplotTime bundle has not been certified across all macOS versions. Inspect the recipient's OS and report actual compatibility rather than claiming a universal minimum.
- The teammate must belong to the Splot Slack workspace and be assigned in SplotTime. If not, an administrator must run `/splot-time add @teammate`. Do not use the maintainer's identity or pairing.
- Team endpoint: `https://crm.usesplot.com/splot-time`.
- Read-only server health: `https://crm.usesplot.com/splot-time/healthz`.
- Calendar timezone: `Europe/Warsaw`, including daylight saving changes.
- Production records are stored on OVH. No OVH SSH keys, bot tokens, admin tokens, `.env` or server credentials are needed or included.

The package includes `SHA256SUMS`. From the extracted package directory, run `shasum -a 256 -c SHA256SUMS`. A matching hash detects corruption; it does not establish publisher identity. Confirm this package came from the teammate's trusted Splot contact. Use `ditto -x -k` or Finder to extract the inner ZIP while preserving the app bundle. Do not use a tool that flattens its symlinks or permissions.

## Data sharing and current behavior

Explain this briefly to the teammate:

- ActivityWatch reads active apps, window titles, supported browser URLs and Mac idle state. SplotTime classifies these locally. These records can contain personal activity even when that activity is excluded from work totals.
- SplotTime uploads dated start/end intervals, a project label, device identity and capture health to the Splot OVH endpoint. New pairings send only the generic device name SplotTime Mac. Existing device names from older releases may remain on the server. Raw titles, URLs, iPhone app identifiers and conversation contents are not included in SplotTime's interval uploads.
- Reports are associated with the user's Slack identity and visible through the team's reporting commands. The records are estimates, not proof of attendance or productivity. Server logs may contain normal connection metadata.
- There are no per-user work-rule selections or daily approvals in this build. Classification uses the shipped `splot-context-v1` heuristic. Read CLASSIFICATION.md for limits.
- Optional iPhone import reads Apple-synced Screen Time data on the Mac after explicit Full Disk Access permission. Do not grant extra permissions just to make a test pass.
- Only the current Mac should be paired to the current teammate. Never copy another person's config, Keychain entry or queue.

## 1. Inspect before changing anything

Find the extracted folder from this AGENTS.md, not from a guessed username. Identify whether `/Applications/SplotTime.app`, ActivityWatch, `~/Library/Application Support/SplotTime/` or `~/Library/LaunchAgents/com.splot.time.companion.plist` already exist.

Read app version using `/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/SplotTime.app/Contents/Info.plist` when present. Existing state belongs to the teammate. Back it up privately before replacement, while capture is stopped. Do not overwrite a running app or discard their data. Do not print `config.json` or `local-url` wholesale. Config includes identifiers and potentially personal rules; `local-url` contains a bearer secret.

For an upgrade, follow the upgrade section below. A fresh install continues here.

## 2. Install ActivityWatch

If absent, use the official stable download page: https://activitywatch.net/downloads/ . Choose the Apple Silicon classic macOS app, not a Research Edition or experimental Tauri build. Follow the official macOS instructions: https://docs.activitywatch.net/en/latest/getting-started.html . Verify the current download link on the vendor's page; do not use an arbitrary mirror or a guessed version URL.

Copy ActivityWatch to Applications and start it. Have the person approve the accessibility/browser-control permissions that the actual installed version requests. Labels vary by macOS version. Do not automate security bypasses or claim permissions are granted merely because a toggle was clicked.

Verify that ActivityWatch responds at `http://127.0.0.1:5600` and that its local sources include both `aw-watcher-window_...` and `aw-watcher-afk_...`, with recent foreground/idle data. ActivityWatch's page can show raw personal history, so inspect minimally and do not include it in screenshots or reports without need. Do not expose port 5600 to the LAN or internet.

SplotTime attempts to start ActivityWatch at launch and every five minutes. Avoid introducing conflicting ActivityWatch distributions or duplicate independent startup mechanisms. Existing legitimate ActivityWatch startup settings can remain.

## 3. Connect Chrome / Safari

For Chrome, install the official ActivityWatch Web Watcher:
https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi

Use the store's normal installation and permission flow; let the user approve extension access as required. After installation, visit an ordinary non-sensitive page in the Chrome profile they use for work. The extension requires ActivityWatch to be running. Confirm recent `aw-watcher-web-chrome...` data, not merely an installed-extension icon.

The classifier reads Chrome sources automatically and matches tab titles to foreground Chrome windows. Conflicting contexts are conservatively excluded. It can also use native URLs from the Mac window watcher. Safari needs native URL capture; this bundle does not contain a Safari extension. Do not claim Safari website capture works until URL-bearing events are observed. Firefox/other browser extensions are not wired into this release's ingestion; native URL capture may work, but must be verified separately.

Official watcher reference: https://docs.activitywatch.net/en/latest/watchers.html . Website capture can reveal personal information locally. No browser extension is installed on the iPhone by this package.

## 4. Install and pair SplotTime

1. Verify package hashes and extract `SplotTime-mac.zip` to a staging folder.
2. Copy `SplotTime.app` to `/Applications/SplotTime.app`, preserving bundle structure. Do not change the bundle's files or signature.
3. After the normal security approval, run `/Applications/SplotTime.app/Contents/MacOS/SplotTime --self-test`. Success prints `Bundled Python, importer, certificates and SQLite passed.` This does not pair, inspect activity or validate macOS permissions.
4. Open the installed app normally. On an unpaired installation it opens a localhost setup page. The dynamic port is expected. Do not substitute an old saved localhost address.
5. The teammate runs `/splot-time pair` in the Splot Slack workspace. The code is one-use and expires after ten minutes. Treat it as a password. Have the teammate paste it directly into the setup form whenever possible; never include it in final output, screenshots, logs or a file being shared.
6. Click **Connect & start automatically**. The server address is built in; do not ask the teammate to choose a server, projects or work apps.
7. Verify that pairing succeeds and startup is enabled. Pairing normally sets `automatic: true`, `policy: "splot-context-v1"` and `startAtLogin: true`. The local credential is stored in macOS Keychain under service `com.splot.time.companion`, account `device`. Do not retrieve or print its value.
8. Close the setup page when finished. After pairing, SplotTime launches silently without a normal Dock window. Reopening the app does not necessarily show a page, and that is expected.

The server automatically updates estimated reports on successful uploads. Daily review is not required. `/splot-time stats`, `/splot-time team` and the Slack app Home show reports. Optional manual edits and deliberate removals are protected against later automatic overwrites.

## 5. Optional one-time iPhone setup

Do not describe Mac success as iPhone success. Ask whether the teammate wants this optional part if their request did not already include it.

- On Mac and iPhone, use the same Apple account, enable Screen Time and enable Share Across Devices.
- The user grants `/Applications/SplotTime.app` Full Disk Access in Mac System Settings. The permission is for the installed SplotTime app, not a blanket permission for the LLM or Terminal.
- In SplotTime's local setup page, expand **Connect iPhone once** and click **Enable iPhone import**.
- The importer retries after permission is available. Apple sync can be delayed. There is no promise of immediate or complete coverage.
- A single discovered iPhone source is selected automatically. Multiple phone sources are ambiguous in this release and need maintainer assistance; do not merge other people's devices or falsely mark this complete.
- Verify actual recent imported phone events and `iphone: "ok"` before claiming success. `iphone-stale` means enabled but not recently captured; `iphone-not-configured` means disabled. A process merely running is insufficient.
- Mixed iPhone apps with only app identifiers, including ChatGPT, Instagram and Safari, are normally excluded because conversation/account/page context is unavailable. Slack is recognised. This does not provide the same classification coverage as the Mac.

Real-device iPhone capture was not end-to-end certified for this package. If permissions or Apple sync prevent verification, finish Mac setup and report the phone as pending.

## 6. Verification before saying done

Run the bundled `check-installation.sh` through `/bin/zsh` after reading it. It is read-only apart from a private temporary response file that it removes. No Python, jq or npm is required. It intentionally does not output raw titles, URLs, device IDs or tokens.

Success requires all of the following, not just an installed icon:

- Installed version is 0.4.1.
- The user is paired to their own Slack account.
- `automatic` and `startAtLogin` are true; `policy` is `splot-context-v1`.
- `launchctl print "gui/$(id -u)/com.splot.time.companion"` succeeds and the job is running. Its plist points to `/Applications/SplotTime.app/Contents/MacOS/SplotTime --background`, with RunAtLoad and KeepAlive enabled.
- ActivityWatch is available; foreground and idle watchers have recent data. Browser context is verified separately.
- Local state becomes `running`; there is a recent successful upload and normally no pending uploads. The capture loop runs about every 60 seconds. Wait for a bounded interval and recheck rather than flooding the APIs.
- Confirm an acknowledged snapshot. A zero-work snapshot can be valid: do not fake sessions, weaken classification or edit hours to force a nonzero test.
- Report iPhone independently as verified, disabled or blocked.

The helper verifies common startup/sync state but cannot prove browser accuracy, membership identity or phone completeness. Do not log the person out or reboot their Mac merely to test startup. If a real reboot test was not done, say startup registration was verified, not reboot behavior.

Final handoff should state the installed version, startup state, successful upload state, browser coverage, phone status and any remaining user action. No daily review instructions. Never claim zero maintenance, guaranteed productive hours or 100% availability.

## Local paths and safe diagnostics

- App: `/Applications/SplotTime.app`.
- Local data: `~/Library/Application Support/SplotTime/`.
- Rules/settings/identity: `config.json` in that folder.
- Upload queue: `queue.sqlite3`, with WAL/SHM companions when open.
- Private current setup URL: `local-url` in that folder.
- Single-instance lock: `instance.lock`.
- Startup job: `~/Library/LaunchAgents/com.splot.time.companion.plist`.
- Credential: macOS Keychain service `com.splot.time.companion`, account `device`.

The setup URL has a fragment used as a local bearer credential. Read it locally and navigate only to its validated `http://127.0.0.1:<port>/` origin. Do not paste it into Slack or the assistant's final response. The page removes the fragment after loading, so an ordinary reload may lose authentication. To reopen setup, reread the current private URL and use the browser tool, without displaying it. Do not guess a port or edit permissions on the data directory to make it world-readable.

The read-only local `GET /status` requires `Authorization: Bearer <fragment>`. Do not put the token in visible shell arguments, command transcripts or debug output. The helper passes the header via standard input to curl, with redirects disabled. Never follow a redirect carrying this credential. There is no unauthenticated remote control endpoint to expose publicly.

There is no persistent, readable per-session explanation log in 0.4.1. ActivityWatch keeps raw events; config holds current decisions; the queue stores project intervals and upload acknowledgements. A historical classification audit is a reconstruction from current rules, not proof of which rule applied earlier. Do not tell the user a classification-history screen exists.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Ask an admin to assign you first | Ask a Splot admin to assign this Slack user. Do not substitute someone else's code. |
| Expired/invalid pairing | Generate a new code with `/splot-time pair` and retry once. Never repeatedly reuse an expired code. |
| Pairing succeeded but startup failed | Verify the app is in Applications and background items are allowed. Use **Enable automatic startup** on the setup page if shown. |
| Existing 0.3.0 settings / review queue | Upgrade the bundle, preserve pairing, then activate `/automatic` as described below. App copying alone does not migrate existing settings to the new policy. |
| App opens no window | Expected when paired. Read the current private setup URL if troubleshooting is needed. |
| Forbidden / Open SplotTime again | Reopen the current private setup URL with its fragment; a stale tab/reload can lose authentication. |
| Missing or stale ActivityWatch idle data | Start ActivityWatch, verify required permissions and its idle/window watchers. No partial total should be invented. |
| Chrome installed but no tab data | Verify extension in the active Chrome profile, ActivityWatch running, and fresh foreground page events. |
| ChatGPT time not counted | A generic title such as ChatGPT/New chat has insufficient context. Do not broaden rules silently. |
| iPhone permission denied or stale | Human checks Full Disk Access and Screen Time sharing. Wait for actual sync. Report pending instead of successful. |
| Upload/network error | Test the HTTPS health endpoint; preserve the local queue so retries can recover. Do not pair again for ordinary network loss. |
| HTTPS/certificate/security warning | Stop. Do not disable TLS verification or bypass the warning. Contact the maintainer. |
| Mac sleep/offline | No desktop capture while asleep. Uploads resume after the app and network return. |
| Multiple machines/sources ambiguous | Keep exclusion and ask the maintainer; do not discard or combine arbitrary sources. |

## Upgrade / reinstall without losing data

1. Read the existing state and back up the current plist, app and entire SplotTime data folder privately. Stop the service before backing up SQLite files; copying only the main database while it is live can lose WAL data.
2. Stop this user's `gui/<uid>/com.splot.time.companion` job with launchctl bootout if loaded, then stop any remaining process whose executable is exactly the installed SplotTime binary. Avoid broad `killall` commands. Ensure it is stopped before replacing files.
3. Preserve the Keychain pairing. Do not use `/splot-time disconnect` as a routine upgrade step; that revokes all of this user's devices.
4. Copy the new app, retaining a reversible old copy outside Applications, and restart it. If an existing LaunchAgent points to the installed app, bootstrap that existing plist. Recheck permissions after replacement because local signing can affect macOS approvals.
5. If existing config does not have `splot-context-v1`, activate `POST /automatic` on the authenticated local endpoint with `{}`. This endpoint sets the policy, automatic mode and login startup; it does not need a new Slack pairing. Use the private local credential only on the validated loopback origin, never in output. This action is part of the requested automatic setup, but follow your tool's confirmation rules.
6. Verify the policy via `/status` and recent uploads. Leave the person's pause and iPhone settings intact unless they asked to change them.

Do not automatically install an old package over a newer version. Compare versions and ask the maintainer if the installed version is newer than this bundle.

## Pause, stop, uninstall and rollback

Only perform removal when requested by the person. Prefer reversible backup/move operations. Stop the LaunchAgent first, then the exact app process. Move the installed app and its plist out of their active locations. Do not delete ActivityWatch, other apps, team server records or another user's settings.

For a clean setup reset, back up and move `~/Library/Application Support/SplotTime/` after stopping capture. Remove only the SplotTime Keychain credential if the user wants pairing cleared. Keep backups private and do not distribute them. `/splot-time disconnect` revokes all of that user's server devices and should be used only when that wider effect is intended. Removing the Mac app does not erase records already on OVH.

For rollback, stop the new process, restore the backed-up bundle/config/plist, keep the compatible Keychain pairing, and verify startup and upload again. Do not restore a stale queue over newer activity without understanding which data would be lost.

## Sources and package limits

Vendor installation and watcher links above were checked on 13 October 2026. Recheck current vendor instructions when installing later. The included app's behavior is defined by version 0.4.1, not by a future ActivityWatch release.

The packaged app passed its bundled self-test and 26 Python classification/queue tests in development. Synthetic browser testing verified one-time pairing and no app-selection UI. These checks do not replace verification on the teammate's Mac. There is no automatic updater, production signing or guaranteed phone coverage in this release.


## Mandatory privacy rules for installation, support and recording

Never show real window/page titles, URLs, chat/channel names, app histories,
source identifiers or tokens in screenshots, videos, shared logs or the final
answer. Use only aggregate health/counts and explicitly synthetic examples.
Do not screen-record the person's Slack workspace, ActivityWatch dashboard,
browser history or their real desktop. Use a clean demonstration instead.
A redacted caption does not make an unredacted screenshot safe to share.

Version 0.4.1 returns only safe setup/health fields from GET /status. Its
config.deviceId is now a paired boolean, never the real device identifier.
Rule maps, app lists, phone/source names, raw review rows and arbitrary errors
are absent. Do not bypass this boundary by dumping config.json or ActivityWatch
events for a routine support report. POST /phone with {"enabled":true} toggles
phone capture without reading or resending private configuration.

ActivityWatch still stores raw history locally and classification still uses it.
This update hides that context from SplotTime; it does not erase existing data,
old shared messages or previously captured recordings. Exact work intervals are
still uploaded to OVH. Do not claim anonymisation or complete data erasure.
