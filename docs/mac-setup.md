# One-time setup, version 0.4.1

Install ActivityWatch and the Chrome ActivityWatch extension. Copy SplotTime.app
to Applications and open it. Paste the code from `/splot-time pair` and choose
Connect & start automatically. There are no app selections or daily reviews.
The app registers login startup during pairing and subsequently runs silently.

The local context policy estimates work using app names, page titles, URLs,
recognised work domains, SPLOT/usesplot references and work-topic phrases.
Explicit personal-topic phrases override work cues. Unclear activity is excluded,
with no review queue. YouTube/Facebook are neither wholly blocked nor counted:
work-context pages count; unrecognised social topics do not. Instagram /usesplot
paths count but generic Instagram activity does not. Browser profiles are matched
to the foreground title; conflicting exclusions win. Idle Mac time is excluded.

This is a deterministic heuristic, not semantic AI or proof of productivity.
It will miss work with ambiguous titles and may count personal use of work tools.
The context vocabulary is shipped with the app, with no per-user rule editor.

Optional iPhone setup requires Screen Time sharing under the same Apple account
and SplotTime Full Disk Access in Mac System Settings. Enable iPhone import once
in setup. One phone source is selected automatically. Apple sync may be delayed;
real-device capture remains unverified. Mixed iPhone apps such as Instagram, ChatGPT and Safari are excluded when
only the app identifier is available. Slack is recognised as a work app.

Reports update automatically on OVH and are labelled estimates. Existing manual
corrections are protected. Raw titles and URLs remain local. This Apple Silicon
build is locally signed. Developer signing, notarization and automatic updating
remain release work; zero maintenance and 100% uptime are not guaranteed.

## Privacy of visible output

Version 0.4.1 exposes only an allowlist of health/setup fields through the local
status endpoint. Raw titles, URLs, review rows, app lists, rule maps, phone/source
identifiers and arbitrary errors are not returned. The deviceId status property
is a paired boolean, not the identifier. iPhone activation uses POST /phone.
New pairing requests use the generic name SplotTime Mac. Existing server device
names are not rewritten by this update. Exact work intervals still go to OVH.

ActivityWatch still retains raw local history and classification still reads it.
This change hides context from SplotTime UI/diagnostics; it does not delete raw
ActivityWatch records or remove text already shared in chats or screenshots.
Use only synthetic examples in shareable guides and recordings. Never include
real activity titles, URLs, window screenshots, tokens or local-url contents.
