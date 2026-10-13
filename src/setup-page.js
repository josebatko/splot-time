const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function setupPage(serverUrl) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SplotTime setup</title>
<style>body{font:17px/1.6 system-ui,sans-serif;color:#20382e;background:#f5f5f1;max-width:720px;margin:60px auto;padding:24px}main{background:white;border:1px solid #dce1db;border-radius:16px;padding:32px}h1{font-size:36px;line-height:1.15}h2{font-size:21px;margin-top:28px}code{background:#edf1ed;padding:3px 7px;border-radius:5px;overflow-wrap:anywhere}li{margin:14px 0}.muted{color:#53665b}footer{font-size:14px;margin-top:26px}</style></head>
<body><main><p class="muted">SPLOT / TIME</p><h1>Connect your Mac</h1><p>This is your team's SplotTime server. Pairing happens in the SplotTime Companion app on your Mac.</p>
<ol><li>Open <strong>SplotTime Companion</strong> on your Mac.</li><li>In Slack, run <code>/splot-time pair</code> to get a one-time code.</li><li>In the companion's setup page, enter this server address and paste the code into the pairing field:</li></ol>
<p><code>${escape(serverUrl)}</code></p>
<p>Choose your work apps and enable automatic startup in the companion. Keep pairing codes private; they expire after ten minutes.</p>
<h2>Review in Slack</h2><p>Use <code>/splot-time review yesterday</code> to review captured time, or <code>/splot-time devices</code> to check your connection.</p>
<footer class="muted">Team records are stored on OVH. ActivityWatch history and the offline upload queue stay on your Mac. The Mac companion is currently a preview; Apple signing and iPhone verification are still pending.</footer>
</main></body></html>`;
}
