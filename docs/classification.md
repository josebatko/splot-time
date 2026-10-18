# What counts as work

Rules live in `src/classify.js` and run on the server, so changing them needs no
reinstall on any Mac. The Mac sends ActivityWatch window events that ActivityWatch
has already clipped to not-idle time. Titles and URLs are classified in memory and
discarded; only start/end times of work are stored.

For each window event, in order:

1. **Never work:** system screens (Finder, System Settings, loginwindow, Windows
   Explorer, login and permission prompts), entertainment apps (games, Spotify,
   Netflix, Steam and similar), and private or incognito windows.
2. **Personal phrases win:** a title or URL mentioning recipes, workouts, dating,
   Netflix, games, holidays and similar (with Polish equivalents) is excluded.
3. **Work phrases count:** SPLOT/usesplot, sourcing, suppliers, textiles, invoices,
   tech packs, marketing/ads/SEO and common software topics, in any app or site.
   This is how a YouTube tutorial or a ChatGPT chat about suppliers counts.
4. **Browsers** (Safari, Chrome, Firefox, Edge, Arc, Brave and others) count on
   recognised work sites only, subdomains included: usesplot.com,
   usesplot.twenty.com, Google Docs/Sheets/Drive, GitHub, GitLab, Linear, Figma,
   Canva, Notion, Vercel, Slack, ChatGPT, Claude, Alibaba, 1688, Stack Overflow,
   MDN, Python docs and Meta business tools. Anything else in a browser is excluded.
   Windows never reports browser URLs, so there (and on a Mac without URL access)
   the site name in the tab title decides: GitHub, Figma, Google Docs/Sheets,
   ChatGPT, Alibaba and so on.
5. **Desktop apps** count when they are work tools (Windows names like
   `Code.exe` or `slack.exe` are matched the same way): AI tools, code editors and
   terminals, design and video apps, CLO and other 3D/CAD tools, Office and
   planning apps, Slack, Teams and Zoom. Everything else is excluded.

The exact app, website and entertainment lists are at the top of `src/classify.js`.

Overlapping work counts once and is split at team-calendar midnight (`TZ`).
These are fixed heuristics, not understanding: they estimate hours and can be
wrong in both directions. Nobody can edit them in Slack.
