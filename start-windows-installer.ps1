$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$MainUrl = "https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-agents-windows.ps1"
$CacheBust = Get-Date -Format "yyyyMMddHHmmss"

if ([Environment]::Is64BitOperatingSystem -and -not [Environment]::Is64BitProcess) {
  $powershell64 = Join-Path $env:WINDIR "Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  if (Test-Path $powershell64) {
    Write-Host "Открываю 64-bit PowerShell для установки..." -ForegroundColor Gray
    $childCommand = "iex (irm '" + $MainUrl + "?cb=" + $CacheBust + "')"
    & $powershell64 -NoProfile -ExecutionPolicy Bypass -Command $childCommand
    exit $LASTEXITCODE
  }
}

iex (irm ($MainUrl + "?cb=" + $CacheBust))
