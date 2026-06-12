param(
  [string]$Server = "",
  [string]$User = "root"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Ssh {
  $cmd = Get-Command ssh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:WINDIR\System32\OpenSSH\ssh.exe",
    "$env:WINDIR\Sysnative\OpenSSH\ssh.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  return $null
}

function Ensure-OpenSsh {
  $ssh = Find-Ssh
  if ($ssh) { return $ssh }

  Write-Step "Установка OpenSSH Client"
  if (-not (Test-Admin)) {
    Write-Host "OpenSSH не найден. Открой PowerShell от имени администратора и запусти эту команду еще раз." -ForegroundColor Yellow
    exit 1
  }

  Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0 | Out-Host
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $ssh = Find-Ssh
  if (-not $ssh) {
    Write-Host "OpenSSH установлен, но Windows еще не видит ssh.exe. Закрой PowerShell, открой заново и запусти команду еще раз." -ForegroundColor Yellow
    exit 1
  }
  return $ssh
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

$ssh = Ensure-OpenSsh

$remote = @'
STUDENT_UI=1 VERSION='0.1.0' BASE_URL='https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0' bash -lc 'tmp=/tmp/install-vps-infobiz-agents.sh; curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh -o $tmp; chmod +x $tmp; $tmp'
'@

Write-Step "Подключение к VPS"
Write-Host "Сейчас Windows попросит пароль от VPS. При вводе пароль может не отображаться — это нормально." -ForegroundColor Gray
Write-Host ""

& $ssh -tt `
  -o StrictHostKeyChecking=no `
  -o UserKnownHostsFile=NUL `
  -o LogLevel=ERROR `
  $Server `
  $remote

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Установка завершилась с ошибкой. Проверь IP, пароль и доступ к VPS." -ForegroundColor Red
  exit $LASTEXITCODE
}
