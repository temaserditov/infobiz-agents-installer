param(
  [string]$Server = "",
  [string]$User = "root"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  $powershell64 = Join-Path $env:WINDIR "Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  if (Test-Path $powershell64) {
    Write-Host "Открываю 64-bit PowerShell для обновления..." -ForegroundColor Gray
    $tmpScript = Join-Path $env:TEMP ("infobiz-agents-update-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".ps1")
    Invoke-WebRequest -Uri ("https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-agents-windows.ps1?cb=" + (Get-Date -Format "yyyyMMddHHmmss")) -OutFile $tmpScript
    & $powershell64 -NoProfile -ExecutionPolicy Bypass -File $tmpScript
    exit $LASTEXITCODE
  }
}

function Find-Ssh {
  $candidates = @(
    "$env:WINDIR\System32\OpenSSH\ssh.exe",
    "$env:WINDIR\Sysnative\OpenSSH\ssh.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  $cmd = Get-Command ssh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

if (-not $Server) {
  $Server = Read-Host "Введите IP VPS"
}
$Server = $Server.Trim()
if (-not $Server) {
  Write-Host "IP VPS не указан." -ForegroundColor Red
  exit 1
}
if ($Server -notmatch "@") {
  $Server = "$User@$Server"
}

$ssh = Find-Ssh
if (-not $ssh) {
  Write-Host "OpenSSH не найден. Открой PowerShell от имени администратора и установи OpenSSH Client." -ForegroundColor Red
  exit 1
}

$remote = @'
VERSION='0.1.0' BASE_URL='https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0' bash -lc 'tmp=/tmp/update-vps-infobiz-agents.sh; curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-vps-infobiz-agents.sh -o $tmp; chmod +x $tmp; $tmp'
'@

Write-Host ""
Write-Host "==> Обновление агентов на VPS" -ForegroundColor Cyan
Write-Host "SSH-клиент: $ssh" -ForegroundColor Gray
Write-Host "Windows попросит пароль от VPS. При вводе пароль может не отображаться — это нормально." -ForegroundColor Gray
Write-Host ""

& $ssh -tt $Server $remote

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Обновление завершилось с ошибкой. Проверь IP, пароль и доступ к VPS." -ForegroundColor Red
  exit $LASTEXITCODE
}
