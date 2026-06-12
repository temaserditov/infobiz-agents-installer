#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<'USAGE'
Usage:
  bash install-vps-remote.sh root@SERVER_IP
  bash install-vps-remote.sh root@SERVER_IP 'VPS_PASSWORD'

Without a password argument, the script uses normal SSH and asks for the
password interactively. With a password argument, it auto-accepts the new host
fingerprint and enters the password using expect.
USAGE
  exit 1
fi

SERVER="${SERVER:-$1}"
VPS_PASSWORD="${VPS_PASSWORD:-${2:-}}"
VERSION="${VERSION:-0.1.0}"
INSTALLER_URL="${INSTALLER_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
SSH_OPTS=(
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o LogLevel=ERROR
)

REMOTE_SCRIPT=$(cat <<REMOTE
set -euo pipefail
tmp="/tmp/install-vps-infobiz-agents.sh"
curl -fsSL "$INSTALLER_URL" -o "\$tmp"
chmod +x "\$tmp"
"\$tmp"
REMOTE
)

if [[ -n "$VPS_PASSWORD" ]]; then
  if ! command -v expect >/dev/null 2>&1; then
    cat >&2 <<'ERR'
ERROR: password mode requires `expect`.
Run without the password argument and enter the password manually.
ERR
    exit 1
  fi
  export VPS_PASSWORD SERVER VERSION BASE_URL REMOTE_SCRIPT
expect <<'EXPECT'
set timeout 8
set password $env(VPS_PASSWORD)
set server $env(SERVER)
set version $env(VERSION)
set base_url $env(BASE_URL)
set script $env(REMOTE_SCRIPT)
spawn ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR $server "VERSION='$version' BASE_URL='$base_url' bash -s"
expect {
  -re "(?i)password:" {
    send -- "$password\r"
  }
  timeout {}
  eof
}
send -- "$script\n"
send \004
set timeout -1
expect eof
EXPECT
else
  ssh "${SSH_OPTS[@]}" "$SERVER" "VERSION='$VERSION' BASE_URL='$BASE_URL' bash -s" <<< "$REMOTE_SCRIPT"
fi
