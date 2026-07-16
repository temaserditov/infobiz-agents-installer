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
  -tt
  -o ConnectTimeout=30
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
  -o StrictHostKeyChecking=accept-new
  -o LogLevel=ERROR
)

REMOTE_COMMAND="set -euo pipefail; tmp=\$(mktemp /tmp/infobiz-install.XXXXXX); trap 'rm -f \"\$tmp\"' EXIT; curl -fsSL '$INSTALLER_URL' -o \"\$tmp\"; chmod 700 \"\$tmp\"; VERSION='$VERSION' BASE_URL='$BASE_URL' \"\$tmp\""

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
# SSH itself enforces the short connection timeout. Once connected, allow a
# clean server installation to run for up to two hours without being killed by
# the wrapper merely because a dependency step is quiet for 30 seconds.
set timeout 7200
set password $env(VPS_PASSWORD)
set server $env(SERVER)
set remote_command $env(REMOTE_COMMAND)
spawn ssh -tt -o ConnectTimeout=30 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR $server $remote_command
set password_prompts 0
expect {
  -re "(?i)password:" {
    incr password_prompts
    if {$password_prompts > 1} {
      puts stderr "SSH rejected the VPS password"
      exit 77
    }
    send -- "$password\r"
    exp_continue
  }
  timeout {
    puts stderr "SSH connection timed out"
    exit 124
  }
  eof
}
set result [wait]
exit [lindex $result 3]
EXPECT
else
  ssh "${SSH_OPTS[@]}" "$SERVER" "$REMOTE_COMMAND"
fi
