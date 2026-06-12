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
    return $plink
  }

  Write-Step "Подготовка запасного SSH-подключения"
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
  $url = "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe"
  Invoke-WebRequest -Uri $url -OutFile $plink
  return $plink
}

function Split-Server {
  param([string]$Target)
  $login = $User
  $host = $Target

  if ($Target -match "^([^@]+)@(.+)$") {
    $login = $Matches[1]
    $host = $Matches[2]
  }

  return @{
    Login = $login
    Host = $host
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

  Write-Step "Повторное подключение через PuTTY/Plink"
  Write-Host "Если появится вопрос о ключе сервера, скрипт автоматически ответит yes." -ForegroundColor Gray
  Write-Host ""

  "y" | & $plink -ssh -P 22 -l $parts.Login -pw $password $parts.Host "exit"
  & $plink -ssh -t -P 22 -l $parts.Login -pw $password $parts.Host $RemoteCommand
  return $LASTEXITCODE
}

if (-not $Server) {
  $Server = Read-Host "Введите SSH-доступ к VPS из панели хостинга (например root@1.2.3.4) или просто IP"
}
$Server = $Server.Trim()
if (-not $Server) {
  Write-Host "VPS не указан." -ForegroundColor Red
  exit 1
}

if ($Server -notmatch "@") {
  $inputUser = Read-Host "Введите логин VPS или нажмите Enter для root"
  $inputUser = $inputUser.Trim()
  if ($inputUser) {
    $User = $inputUser
  }
  $Server = "$User@$Server"
}

$ssh = Ensure-OpenSsh
$debugLog = Join-Path $env:TEMP ("infobiz-agents-ssh-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

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
  -o KbdInteractiveAuthentication=yes `
  -o PubkeyAuthentication=no `
  -o PreferredAuthentications=keyboard-interactive,password `
  -o NumberOfPasswordPrompts=3 `
  -E $debugLog `
  $Server `
  $remote

if ($LASTEXITCODE -ne 0) {
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
