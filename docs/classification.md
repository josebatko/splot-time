# Classification in SplotTime 0.4.1

Policy identifier: `splot-context-v1`. This file describes shipped behavior, not future plans.

## How a decision is made

1. Capture foreground Mac events and intersect them with ActivityWatch's not-idle intervals. Honor locally recorded pauses.
2. Match Chrome browser events to the foreground window title. Use native browser URLs when available. Exclude reported private/incognito events. Conflicting browser profiles with the same title are handled conservatively: excluded spans win.
3. Inspect app name, title, URL path/query and recognised domain locally. No external model or API receives those fields.
4. Explicit personal-topic phrases override work phrases and domains. Examples: recipes, workouts, dating, gaming, holidays, meal planning, and corresponding supported Polish terms.
5. Work phrases recognise SPLOT/usesplot, sourcing, suppliers, garments/textiles, invoices, tech packs, marketing/ads/SEO and common software-development topics. Matching has word boundaries. This is a finite shipped vocabulary, not semantic understanding.
6. Recognised work domains can count without a work phrase: usesplot.com, crm.usesplot.com, linear.app, figma.com, github.com, gitlab.com, stackoverflow.com, developer.mozilla.org, docs.python.org, docs.google.com, business.facebook.com, adsmanager.facebook.com, business.instagram.com and canva.com. Matching includes subdomains and checks host boundaries.
7. Recognised desktop work tools can count from app name alone: Code/Visual Studio Code, Cursor, Xcode, IntelliJ IDEA, PyCharm, WebStorm, Figma, Linear, Slack, Terminal, iTerm2, Warp, Postman and Docker Desktop. That is an estimate and can include personal use of those tools.
8. Other ambiguous events are excluded. No review queue is generated in automatic mode.
9. Merge overlapping eligible intervals across Mac/phone capture. Upload only start/end time and the generic `Selected work apps` project label, not a guess at the employee's task or productivity.

System screens such as Finder, System Settings, Dock, loginwindow and authentication prompts are excluded. The native apps named YouTube and Facebook are excluded; work-context recognition primarily applies to their browser pages.

## Examples

| Local context | Result |
| --- | --- |
| YouTube page titled “How to debug a React API” | Work estimate |
| Facebook page titled “SPLOT new collection” | Work estimate |
| Instagram URL `/usesplot/` | Work estimate |
| Meta Business Suite at business.facebook.com | Work estimate |
| Generic YouTube football highlights | Excluded |
| Generic Facebook feed or Instagram reels | Excluded without a work cue |
| ChatGPT title “SPLOT supplier comparison” | Work estimate |
| ChatGPT title “Dinner recipes” | Excluded |
| ChatGPT title “ChatGPT” or “New chat” | Excluded without useful context |
| Google document titled “Dinner recipes” | Excluded despite the otherwise recognised domain |
| Active Slack window | Work estimate |
| Unknown app without a work cue | Excluded |

## Browser limitations

The companion does not inspect page bodies, messages, screenshots or actual ChatGPT conversations. It uses metadata exposed by the watchers. A title can be vague, stale or misleading. Work on unrecognised topics is often omitted; a hobby project on a recognised development site can count. Private-mode protection depends on the watcher supplying the relevant flag and is not a promise of comprehensive private-browsing detection.

Chrome tab events require a matching foreground title. Other browser extension buckets are not consumed by this release. Safari and other supported native browser events need useful metadata from the window watcher. Missing context is not evidence that a person was idle or not working.

## iPhone limitations

Screen Time import is delayed and often exposes only an app bundle identifier. With no page or conversation metadata, ChatGPT, Instagram and Safari cannot reliably be split into work and personal use and are excluded. The Slack identifier `com.tinyspeck.chatlyio` is recognised. The app does not know which Instagram account the person was using from an app identifier alone.

There is no complete iPhone/macOS behavioral parity. Never describe phone mixed-app classification as verified unless you have actual contextual data supporting it.

## Reports and correction

OVH receives project intervals and merges overlapping device activity. Slack reports label automatic hours as estimates. Human edits and deliberate removals are protected from subsequent automatic imports. Capture covers a rolling seven-day window; already-queued snapshots can retry after outages. Previously revoked devices are excluded from snapshot suggestions.

No per-session explanation log or classifier dashboard is shipped. Inspecting past decisions requires reconstructing them from local ActivityWatch events and current configuration. That is not an immutable record of the policy in use at the time.

Do not use these heuristics as proof of productive work or as a precise attendance record. No continuous AI learning, zero-maintenance guarantee or automatic updater is present in this package.

All examples above are invented. Do not include real activity titles in a shared audit or installation recording. Version 0.4.1 removes raw context from status responses; it does not erase ActivityWatch history.
