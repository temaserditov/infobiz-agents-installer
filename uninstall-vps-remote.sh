#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<'USAGE'
Usage:
  bash uninstall-vps-remote.sh root@SERVER_IP
  bash uninstall-vps-remote.sh root@SERVER_IP 'VPS_PASSWORD'
USAGE
  exit 1
fi

SERVER="${SERVER:-$1}"
VPS_PASSWORD="${VPS_PASSWORD:-${2:-}}"
UNINSTALLER_URL="${UNINSTALLER_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/uninstall-vps-infobiz-agents.sh}"
SSH_OPTS=(
  -tt
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o LogLevel=ERROR
)

REMOTE_COMMAND="set -euo pipefail; tmp='/tmp/uninstall-vps-infobiz-agents.sh'; curl -fsSL '$UNINSTALLER_URL' -o \"\$tmp\"; chmod +x \"\$tmp\"; \"\$tmp\""

if [[ -n "$VPS_PASSWORD" ]]; then
  if ! command -v expect >/dev/null 2>&1; then
    cat >&2 <<'ERR'
ERROR: password mode requires `expect`.
Run without the password argument and enter the password manually.
ERR
    exit 1
  fi
  export VPS_PASSWORD SERVER REMOTE_COMMAND
expect <<'EXPECT'
set timeout 8
set password $env(VPS_PASSWORD)
set server $env(SERVER)
set remote_command $env(REMOTE_COMMAND)
spawn ssh -tt -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR $server $remote_command
expect {
  -re "(?i)password:" {
    send -- "$password\r"
  }
  timeout {}
  eof
}
set timeout -1
expect eof
EXPECT
else
  ssh "${SSH_OPTS[@]}" "$SERVER" "$REMOTE_COMMAND"
fi
