// The whole client side of SplotTime, for Mac (launchd) and Windows (Task Scheduler):
//   install  one-time setup, run from the command /splot-time connect prints
//   run      launcher the OS scheduler starts hourly; it never changes once installed
//   sync     moves bytes between ActivityWatch and the server with curl
// The launcher downloads the current sync script from the server on every run,
// so changes to agent/sync.* reach every computer within the hour.
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./agent/${name}`, import.meta.url), 'utf8');
const SCRIPTS = {
  mac: { install: read('install.sh'), run: read('run.sh'), sync: read('sync.sh') },
  windows: { install: read('install.ps1'), run: read('run.ps1'), sync: read('sync.ps1') },
};
export const OS_OF = { 'sync.sh': 'mac', 'sync.ps1': 'windows' };

// Replacer functions, so `$` in the scripts is never treated as a pattern.
const withServer = (script, serverUrl) => script.replace('__SERVER__', () => String(serverUrl).replace(/\/+$/, '').replace(/'/g, ''));

/** Current sync script for `os`, as the launcher downloads it. */
export const syncScript = (serverUrl, os) => withServer(SCRIPTS[os].sync, serverUrl);

/** Installer for `os` ('mac' or 'windows') with the server address filled in. */
export function installScript(serverUrl, os = 'mac') {
  const { install, run } = SCRIPTS[os];
  return install.replace('__RUN__', () => withServer(run, serverUrl).trimEnd()).replace('__SYNC__', () => syncScript(serverUrl, os).trimEnd());
}
