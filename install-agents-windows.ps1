param(
  [string]$Server = "",
  [string]$User = "root"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$SelfUrl = "https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-agents-windows.ps1"

if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  $powershell64 = Join-Path $env:WINDIR "Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  if (Test-Path $powershell64) {
    Write-Host "Перезапускаю установщик в 64-bit PowerShell..." -ForegroundColor Gray
    $tmpScript = Join-Path $env:TEMP ("infobiz-agents-windows-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".ps1")
    Invoke-WebRequest -Uri ($SelfUrl + "?cb=force64-" + (Get-Date -Format "yyyyMMddHHmmss")) -OutFile $tmpScript
    $childArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $tmpScript)
    if ($Server) { $childArgs += @("-Server", $Server) }
    if ($User) { $childArgs += @("-User", $User) }
    & $powershell64 @childArgs
    exit $LASTEXITCODE
  }
}

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

function Get-PlainTextPassword {
  $secure = Read-Host "Введите пароль VPS для запасного подключения" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Get-Plink {
  $toolDir = Join-Path $env:TEMP "infobiz-agents-tools"
  $plink = Join-Path $toolDir "plink.exe"
  if (Test-Path $plink) {
    $cachedSignature = Get-AuthenticodeSignature -FilePath $plink
    if ($cachedSignature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
      return $plink
    }
    Remove-Item -Force $plink -ErrorAction SilentlyContinue
  }

  Write-Step "Подготовка запасного SSH-подключения"
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
  $url = "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe"
  Invoke-WebRequest -Uri $url -OutFile $plink
  $signature = Get-AuthenticodeSignature -FilePath $plink
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    Remove-Item -Force $plink -ErrorAction SilentlyContinue
    throw "Скачанный Plink не прошел проверку цифровой подписи."
  }
  return $plink
}

function Split-Server {
  param([string]$Target)
  $login = $User
  $targetHost = $Target

  if ($Target -match "^([^@]+)@(.+)$") {
    $login = $Matches[1]
    $targetHost = $Matches[2]
  }

  return @{
    Login = $login
    Host = $targetHost
  }
}

function Invoke-PlinkInstall {
  param(
    [string]$Target,
    [string]$RemoteCommand
  )

  $parts = Split-Server $Target
  $plink = Get-Plink
  $password = Get-PlainTextPassword
  $passwordFile = Join-Path $env:TEMP ("infobiz-plink-password-" + [guid]::NewGuid().ToString("N") + ".txt")
  [IO.File]::WriteAllText($passwordFile, $password, (New-Object Text.UTF8Encoding($false)))

  Write-Step "Повторное подключение через PuTTY/Plink"
  Write-Host "Если появится вопрос о ключе сервера, скрипт автоматически ответит yes." -ForegroundColor Gray
  Write-Host ""

  try {
    "y" | & $plink -ssh -P 22 -l $parts.Login -pwfile $passwordFile $parts.Host "exit"
    if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
    & $plink -ssh -t -P 22 -l $parts.Login -pwfile $passwordFile $parts.Host $RemoteCommand
    return $LASTEXITCODE
  } finally {
    Remove-Item -Force $passwordFile -ErrorAction SilentlyContinue
    $password = $null
  }
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
$debugLog = Join-Path $env:TEMP ("infobiz-agents-ssh-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

$remote = @'
STUDENT_UI=1 VERSION='0.1.0' BASE_URL='https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0' bash -lc 'set -euo pipefail; tmp=$(mktemp /tmp/infobiz-install.XXXXXX); trap '"'"'rm -f "$tmp"'"'"' EXIT; curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh -o "$tmp"; chmod 700 "$tmp"; "$tmp"'
'@

Write-Step "Подключение к VPS"
Write-Host "SSH-клиент: $ssh" -ForegroundColor Gray
Write-Host "Сейчас Windows попросит пароль от VPS. При вводе пароль может не отображаться — это нормально." -ForegroundColor Gray
Write-Host ""

& $ssh -tt `
  -o BatchMode=no `
  -o StrictHostKeyChecking=accept-new `
  -E $debugLog `
  $Server `
  $remote

$sshExit = $LASTEXITCODE
if ($sshExit -ne 0) {
  if ($sshExit -ne 255) {
    Write-Host ""
    Write-Host "VPS подключился, но серверный установщик завершился с ошибкой ($sshExit). Повторно установку не запускаю." -ForegroundColor Red
    Write-Host "Диагностический лог SSH: $debugLog" -ForegroundColor Gray
    exit $sshExit
  }
  Write-Host ""
  Write-Host "Диагностический лог SSH: $debugLog" -ForegroundColor Gray
  if (Test-Path $debugLog) {
    Select-String -Path $debugLog -Pattern "Authentications|Permission denied|Offering|Next authentication|keyboard-interactive|password|Connection established|Authenticating to" -ErrorAction SilentlyContinue |
      Select-Object -Last 20 |
      ForEach-Object { Write-Host $_.Line -ForegroundColor DarkGray }
  }
  Write-Host ""
  Write-Host "Встроенный Windows SSH не подключился. Пробую запасной режим." -ForegroundColor Yellow
  $plinkExit = Invoke-PlinkInstall -Target $Server -RemoteCommand $remote
  if ($plinkExit -ne 0) {
    Write-Host ""
    Write-Host "Установка завершилась с ошибкой. Проверь IP, логин, пароль и доступ к VPS." -ForegroundColor Red
    Write-Host "Если видишь Permission denied: это SSH-сервер не принял логин/пароль. Проверь точную строку подключения в панели VPS или сбрось пароль root." -ForegroundColor Yellow
    exit $plinkExit
  }
}
