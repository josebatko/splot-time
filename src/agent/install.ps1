# SplotTime installer for Windows. Run the one-line command from /splot-time connect,
# which sets SPLOT_TOKEN and pipes this script into PowerShell.
$ErrorActionPreference = 'Stop'
$token = $env:SPLOT_TOKEN
if (-not $token) { Write-Host 'Copy the full command from /splot-time connect in Slack.'; return }
$D = Join-Path $env:LOCALAPPDATA 'SplotTime'
New-Item -ItemType Directory -Force -Path $D | Out-Null

# Remove the old SplotTime app completely. ActivityWatch keeps all history.
# It started from the registry, ran as SplotTime.exe or pythonw.exe from an
# unzipped folder, and kept a login in Credential Manager.
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$oldStart = (Get-ItemProperty -Path $runKey -Name SplotTime -ErrorAction SilentlyContinue).SplotTime
Remove-ItemProperty -Path $runKey -Name SplotTime -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='SplotTime.exe' OR Name='pythonw.exe' OR Name='python.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq 'SplotTime.exe' -or $_.CommandLine -match 'portable_start\.py|companion\\main\.py' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
cmdkey.exe /delete:device@com.splot.time.companion 2>&1 | Out-Null
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'SplotTime*.lnk') -ErrorAction SilentlyContinue
'config*.json', 'config.tmp', 'queue.sqlite3*', 'local-url', 'instance.lock', 'startup-error.txt' |
  ForEach-Object { Remove-Item (Join-Path $D $_) -Force -ErrorAction SilentlyContinue }
# The unzipped app folder: start from the program in the old startup entry and walk up
# to the folder that holds the app's own files. Nothing else is ever deleted.
if ($oldStart -match '^"?([^"]+?\.exe)') {
  $folder = Split-Path $Matches[1]
  for ($i = 0; $i -lt 3 -and $folder; $i++) {
    if ((Test-Path (Join-Path $folder 'Start-SplotTime.cmd')) -or (Test-Path (Join-Path $folder 'SplotTime.exe'))) {
      Remove-Item $folder -Recurse -Force -ErrorAction SilentlyContinue
      break
    }
    $folder = Split-Path $folder
  }
}

$nl = [Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $D 'auth'), 'Authorization: Bearer ' + $token + $nl)
[IO.File]::WriteAllText((Join-Path $D 'run.ps1'), @'
__RUN__
'@)
[IO.File]::WriteAllText((Join-Path $D 'sync.ps1'), @'
__SYNC__
'@)
Remove-Item (Join-Path $D 'last-sync') -ErrorAction SilentlyContinue

# Hourly, also after restarts and missed runs. Windows 11 runs it with no window at all.
$taskArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $D 'run.ps1') + '"'
if ([Environment]::OSVersion.Version.Build -ge 22000) { $action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless powershell.exe ' + $taskArgs) }
else { $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs }
$hourly = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
try {
  $logon = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME)
  Register-ScheduledTask -TaskName 'SplotTime sync' -Action $action -Trigger @($logon, $hourly) -Settings $settings -Force | Out-Null
} catch {
  Register-ScheduledTask -TaskName 'SplotTime sync' -Action $action -Trigger $hourly -Settings $settings -Force | Out-Null
}

$installed = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\ActivityWatch\aw-qt.exe'),
  (Join-Path $env:ProgramFiles 'ActivityWatch\aw-qt.exe'),
  (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'ActivityWatch\aw-qt.exe')
) | Where-Object { Test-Path $_ }
if (-not $installed) {
  Write-Host 'SplotTime is installed. One step left: install ActivityWatch (opening the download page).'
  Write-Host 'Once it is installed, SplotTime picks it up within the hour. Nothing else to do.'
  Start-Process 'https://activitywatch.net/downloads/'
  return
}
Start-ScheduledTask -TaskName 'SplotTime sync'
Write-Host 'Checking the first sync...'
$status = Join-Path $D 'last-sync'
for ($i = 0; $i -lt 150 -and -not (Test-Path $status); $i++) { Start-Sleep 2 }
$result = if (Test-Path $status) { Get-Content $status -Raw } else { '' }
if ($result -like 'ok*') { Write-Host 'Done. SplotTime now syncs every hour in the background, also after restarts. You can close this window.' }
elseif ($result -like 'failed*') { Write-Host ('Installed, but the first sync ' + $result.Trim() + '. It retries every hour.') }
else { Write-Host 'Installed. The first sync is still running; it retries every hour. You can close this window.' }
