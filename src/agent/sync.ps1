# SplotTime sync. Reads ActivityWatch on this PC and sends it to the team server.
# Uses the curl.exe built into Windows and temporary files, so bytes pass through unchanged.
$S = '__SERVER__'
$D = Join-Path $env:LOCALAPPDATA 'SplotTime'
$AW = 'http://127.0.0.1:5600/api/0'
$curl = Join-Path $env:SystemRoot 'System32\curl.exe'
$json = 'Content-Type: application/json'
$lock = Join-Path $D 'lock'
$files = 'buckets.json', 'query.json', 'result.json' | ForEach-Object { Join-Path $D $_ }

function Finish($message) {
  Remove-Item $files -Force -ErrorAction SilentlyContinue
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
  Set-Content -Path (Join-Path $D 'last-sync') -Value $message
  exit 0
}

# One run at a time. A lock left by a run that was killed expires after 15 minutes.
if ((Test-Path $lock) -and (Get-Item $lock).LastWriteTime -lt (Get-Date).AddMinutes(-15)) { Remove-Item $lock -Force }
if (Test-Path $lock) { exit 0 }
New-Item -ItemType Directory -Path $lock | Out-Null

& $curl -fs -m 5 -o NUL "$AW/info"
if ($LASTEXITCODE -ne 0) {
  $aw = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\ActivityWatch\aw-qt.exe'),
    (Join-Path $env:ProgramFiles 'ActivityWatch\aw-qt.exe'),
    (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'ActivityWatch\aw-qt.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $aw) { Finish 'failed: ActivityWatch is not installed' }
  Start-Process $aw
  $i = 0
  do { Start-Sleep 5; $i++; & $curl -fs -m 5 -o NUL "$AW/info" } until ($LASTEXITCODE -eq 0 -or $i -ge 24)
  if ($LASTEXITCODE -ne 0) { Finish 'failed: ActivityWatch did not start' }
}
& $curl -fs -m 30 -o $files[0] "$AW/buckets/"
if ($LASTEXITCODE -ne 0) { Finish 'failed: could not read ActivityWatch' }
$code = & $curl -s -m 60 -H "@$D\auth" -H $json --data-binary "@$($files[0])" -o $files[1] -w '%{http_code}' "$S/v1/query"
if ($LASTEXITCODE -ne 0) { Finish 'failed: could not reach the SplotTime server' }
switch ($code) {
  '200' {}
  '401' { Finish 'failed: this PC is no longer connected, run /splot-time connect in Slack again' }
  '409' { Finish 'failed: ActivityWatch has no window and idle data yet' }
  default { Finish "failed: SplotTime server error $code" }
}
& $curl -fs -m 300 -H $json --data-binary "@$($files[1])" -o $files[2] "$AW/query/"
if ($LASTEXITCODE -ne 0) { Finish 'failed: ActivityWatch query failed' }
& $curl -fs -m 300 -H "@$D\auth" -H $json --data-binary "@$($files[2])" -o NUL "$S/v1/activity"
if ($LASTEXITCODE -ne 0) { Finish 'failed: upload failed' }
Finish "ok $(Get-Date)"
# end of SplotTime sync
