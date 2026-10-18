export function setupPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SplotTime setup</title>
<style>body{font:17px/1.6 system-ui,sans-serif;color:#20382e;background:#f5f5f1;max-width:720px;margin:60px auto;padding:24px}main{background:white;border:1px solid #dce1db;border-radius:16px;padding:32px}h1{font-size:36px;line-height:1.15}code{background:#edf1ed;padding:3px 7px;border-radius:5px}li{margin:14px 0}.muted{color:#53665b}</style></head>
<body><main><p class="muted">SPLOT / TIME</p><h1>Connect your computer</h1>
<ol><li>Install <a href="https://activitywatch.net/downloads/">ActivityWatch</a> and open it once.</li><li>In Slack, run <code>/splot-time connect</code>.</li><li>Paste the command it gives you: into Terminal on a Mac, or into Win + R on Windows. Done: your computer syncs every hour from then on.</li></ol>
<p class="muted">Hours are measured, not typed in, and cannot be edited. Use <code>/splot-time devices</code> to see when your computer last synced.</p>
</main></body></html>`;
}
