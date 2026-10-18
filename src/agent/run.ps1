# SplotTime launcher. This file never changes after install: each run it fetches
# the current sync script from the server, so fixes reach every PC on their own.
# A download that fails or looks broken is ignored and the last good copy runs.
$S = '__SERVER__'
$D = Join-Path $env:LOCALAPPDATA 'SplotTime'
$curl = Join-Path $env:SystemRoot 'System32\curl.exe'
$new = Join-Path $D 'sync.new'
$sync = Join-Path $D 'sync.ps1'
& $curl -fs -m 30 -o $new "$S/agent/sync.ps1"
$ok = ($LASTEXITCODE -eq 0) -and (Test-Path $new) -and ((Get-Content $new -Tail 1) -eq '# end of SplotTime sync')
if ($ok) {
  $errors = $null
  [void][Management.Automation.PSParser]::Tokenize((Get-Content $new -Raw), [ref]$errors)
  $ok = -not $errors
}
if ($ok) { Move-Item -Force $new $sync } else { Remove-Item $new -Force -ErrorAction SilentlyContinue }
& $sync
