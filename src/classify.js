// Turns ActivityWatch window events (already clipped to not-idle time on the Mac)
// into work intervals. Runs on the server so rule fixes reach every Mac at once.
// Raw titles and URLs are classified in memory and never stored.

export const WORK_PROJECT = 'Selected work apps';

// App names are compared lowercased with any `.exe` removed, so one list covers
// Mac names ("Google Chrome") and Windows process names ("chrome.exe").
const names = list => new Set(list.map(n => n.toLowerCase()));
const SYSTEM_APPS = names(['Finder','System Settings','System Preferences','SystemUIServer','Control Center','Notification Center','UserNotificationCenter','coreautha','loginwindow','Dock','Window Server','Spotlight','SecurityAgent','SplotTime','universalAccessAuthWarn',
  'explorer','LockApp','SearchHost','SearchApp','ShellExperienceHost','StartMenuExperienceHost','ApplicationFrameHost','SystemSettings','Taskmgr','consent','LogonUI','unknown']);
const BROWSER_APPS = names([
  'Arc', 'brave', 'Brave', 'Brave Browser', 'chrome', 'Chromium', 'Comet', 'Dia', 'DuckDuckGo',
  'Firefox', 'Firefox Developer Edition', 'Firefox Nightly', 'Floorp', 'Google Chrome',
  'Google Chrome Beta', 'Google Chrome Canary', 'Google Chrome Dev', 'google-chrome', 'Helium',
  'LibreWolf', 'Microsoft Edge', 'Microsoft Edge Beta', 'Mozilla Firefox', 'msedge',
  'Mullvad Browser', 'opera', 'Opera', 'Opera GX', 'Orion', 'Safari', 'Safari Technology Preview',
  'Sidekick', 'SigmaOS', 'Thorium', 'Tor Browser', 'Vivaldi', 'vivaldi', 'Waterfox', 'Wavebox',
  'zen', 'Zen', 'Zen Browser'
]);
const WORK_APPS = names([
  'Ableton Live', 'Adobe After Effects', 'Adobe Audition', 'Adobe Illustrator', 'Adobe InDesign',
  'Adobe Photoshop', 'Adobe Premiere', 'Adobe Premiere Pro', 'Affinity Designer', 'Affinity Photo',
  'Affinity Publisher', 'After Effects', 'Airtable', 'Android Studio', 'Asana', 'Audacity',
  'Audition', 'AutoCAD', 'Autodesk Fusion', 'BBEdit', 'Blender', 'Browzwear', 'Canva', 'CapCut',
  'ChatGPT', 'Cinema 4D', 'Claude', 'ClickUp', 'CLO', 'CLO Standalone', 'CLO_Standalone', 'cmd',
  'Code', 'Codex', 'Copilot', 'Cursor', 'DataGrip', 'datagrip64', 'DaVinci Resolve', 'DBeaver',
  'Descript', 'devenv', 'Docker Desktop', 'EXCEL', 'Excel', 'Figma', 'Final Cut Pro', 'Fork',
  'Front', 'Fusion 360', 'Ghostty', 'GIMP', 'GitHub Desktop', 'idea64', 'Illustrator', 'InDesign',
  'Inkscape', 'Insomnia', 'IntelliJ IDEA', 'iTerm2', 'Keynote', 'LibreOffice', 'Linear',
  'LM Studio', 'Logic Pro', 'Loom', 'Marvelous Designer', 'Microsoft Copilot', 'Microsoft Excel',
  'Microsoft OneNote', 'Microsoft Outlook', 'Microsoft PowerPoint', 'Microsoft Teams',
  'Microsoft Word', 'Miro', 'Monday', 'monday.com', 'ms-teams', 'MSTeams', 'Notion', 'Nova',
  'Numbers', 'OBS', 'OBS Studio', 'obs64', 'Obsidian', 'Ollama', 'OneNote', 'Outlook', 'Pages',
  'Penpot', 'Perplexity', 'Photoshop', 'Postman', 'powerpnt', 'PowerPoint', 'PowerShell',
  'powershell', 'Premiere Pro', 'pwsh', 'PyCharm', 'pycharm64', 'Resolve', 'Sketch', 'SketchUp',
  'Slack', 'soffice.bin', 'Sourcetree', 'Spark', 'studio64', 'Sublime Text', 'sublime_text',
  'Superhuman', 'TablePlus', 'Teams', 'Terminal', 'Things', 'Thunderbird', 'Todoist', 'Trello',
  'Visual Studio', 'Visual Studio Code', 'VStitcher', 'Warp', 'Webex', 'WebStorm', 'webstorm64',
  'WindowsTerminal', 'Windsurf', 'winword', 'Word', 'Xcode', 'Zed', 'Zoom', 'zoom.us'
]);
const WORK_HOSTS = [
  '1688.com', 'admin.shopify.com', 'adsmanager.facebook.com', 'airtable.com', 'alibaba.com',
  'asana.com', 'atlassian.net', 'bitbucket.org', 'business.facebook.com', 'business.instagram.com',
  'calendar.google.com', 'canva.com', 'chat.openai.com', 'chatgpt.com', 'claude.ai', 'clickup.com',
  'console.anthropic.com', 'copilot.microsoft.com', 'developer.mozilla.org', 'docs.google.com',
  'docs.python.org', 'drive.google.com', 'figma.com', 'gemini.google.com', 'github.com',
  'gitlab.com', 'linear.app', 'mail.google.com', 'meet.google.com', 'miro.com', 'monday.com',
  'netlify.com', 'notion.com', 'notion.so', 'outlook.office.com', 'outlook.office365.com',
  'perplexity.ai', 'platform.openai.com', 'posthog.com', 'sentry.io', 'sheets.google.com',
  'slack.com', 'stackoverflow.com', 'teams.microsoft.com', 'trello.com', 'usesplot.com',
  'usesplot.twenty.com', 'vercel.com', 'zoom.us'
];
// Entertainment never counts, whatever its window title says.
const LEISURE_APPS = names([
  'Apple Music', 'Apple TV', 'Battle.net', 'Battle.net Launcher', 'Counter-Strike 2', 'cs2',
  'Deezer', 'Disney+', 'Dota 2', 'dota2', 'EA', 'EADesktop', 'Epic Games Launcher',
  'EpicGamesLauncher', 'Facebook', 'Fortnite', 'FortniteClient-Win64-Shipping', 'GalaxyClient',
  'GOG Galaxy', 'Hearthstone', 'Hulu', 'IINA', 'Instagram', 'League of Legends', 'LeagueClient',
  'Minecraft', 'Minecraft Launcher', 'MinecraftLauncher', 'Music', 'Netflix', 'Origin', 'Plex',
  'Prime Video', 'RimWorld', 'Roblox', 'RobloxPlayerBeta', 'Spotify', 'Stardew Valley', 'Steam',
  'steamwebhelper', 'Terraria', 'The Sims 4', 'TikTok', 'TS4_x64', 'TV', 'Twitch',
  'Ubisoft Connect', 'upc', 'VALORANT', 'VALORANT-Win64-Shipping', 'VLC', 'World of Warcraft',
  'Wow', 'Xbox', 'YouTube', 'YouTube Music'
]);
// Without a URL (Windows never reports one) a browser tab is judged by the site name in its title.
const WORK_TITLE = /\b(github|gitlab|figma|linear|canva|notion|vercel|chatgpt|claude|alibaba|google (docs|sheets|drive|slides)|stack overflow|business suite|ads manager|twenty)\b/i;
const PERSONAL_CONTEXT = /\b(recipe|recipes|cooking|workout|fitness|dating|netflix|minecraft|fortnite|hearthstone|gameplay|gaming|horoscope|vacation|holiday itinerary|meal plan|przepis|przepisy|trening|wakacje|randki)\b/i;
const WORK_CONTEXT = /\b(splot|usesplot|supplier|suppliers|sourcing|textile|textiles|fabric|fabrics|garment|garments|production order|purchase order|invoice|invoices|client proposal|client brief|rfq|wholesale|screen printing|embroidery|sewing|pattern making|tech pack|marketing|content calendar|ad campaign|ads manager|business suite|conversion tracking|meta pixel|analytics|seo|ecommerce|e-commerce|shopify|typescript|javascript|python|react|next[ .]?js|api|debugging|programming|software development|pull request|database|docker|kubernetes|dostawca|dostawcy|tkanina|tkaniny|dzianina|dzianiny|szwalnia|produkcja|faktura|faktury|kampania|reklama|reklamy)\b/i;

const domainIs = (host, domain) => host === domain || host.endsWith('.' + domain);

/** True when one window event counts as work. Unclear activity does not count. */
export function isWork(data = {}) {
  const app = String(data.app ?? '').toLowerCase().replace(/\.exe$/, '');
  if (!app || SYSTEM_APPS.has(app) || data.incognito || data.private) return false;
  if (LEISURE_APPS.has(app)) return false;
  const title = String(data.title ?? '');
  let host = '', context = title, web = false;
  if (data.url) {
    try {
      const u = new URL(data.url);
      web = ['http:','https:'].includes(u.protocol);
      host = u.hostname.toLowerCase().replace(/\.$/, '');
      context = [title, decodeURIComponent(u.pathname), decodeURIComponent(u.search)].join(' ');
    } catch { return false; }
  }
  if (PERSONAL_CONTEXT.test(context)) return false;
  if (WORK_CONTEXT.test(context)) return true;
  if (BROWSER_APPS.has(app)) {
    if (!data.url) return WORK_TITLE.test(title);
    return web && host !== 'localhost' ? WORK_HOSTS.some(d => domainIs(host, d)) : false;
  }
  return WORK_APPS.has(app);
}

export function mergeSpans(spans) {
  const out = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    if (out.length && start <= out.at(-1)[1]) out.at(-1)[1] = Math.max(end, out.at(-1)[1]);
    else out.push([start, end]);
  }
  return out;
}

const dayOf = (ms, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Next local midnight after `ms`, found by searching forward in 15-minute steps then bisecting. */
function nextMidnight(ms, timeZone) {
  const day = dayOf(ms, timeZone);
  let lo = ms, hi = ms + 15 * 60000;
  while (dayOf(hi, timeZone) === day) { lo = hi; hi += 15 * 60000; }
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (dayOf(mid, timeZone) === day) lo = mid; else hi = mid; }
  return hi;
}

/** Work intervals grouped by team calendar day: { 'YYYY-MM-DD': [{start,end,project}] }. */
export function workByDay(events, timeZone, now = Date.now()) {
  const spans = [];
  for (const e of Array.isArray(events) ? events : []) {
    const start = Date.parse(e?.timestamp);
    const duration = Number(e?.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || !isWork(e.data)) continue;
    spans.push([Math.round(start), Math.min(now, Math.round(start + duration * 1000))]);
  }
  const days = {};
  for (let [start, end] of mergeSpans(spans)) {
    while (start < end) {
      const stop = Math.min(end, nextMidnight(start, timeZone));
      (days[dayOf(start, timeZone)] ??= []).push({ start, end: stop, project: WORK_PROJECT });
      start = stop;
    }
  }
  return days;
}

export { dayOf };
