#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<'USAGE'
Usage:
  bash install-vps-remote.sh root@SERVER_IP

The script uses normal SSH. Enter the VPS password when SSH asks for it.
USAGE
  exit 1
fi

SERVER="${SERVER:-$1}"
VERSION="${VERSION:-0.1.0}"
INSTALLER_URL="${INSTALLER_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"

ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=10 "$SERVER" \
  "VERSION='$VERSION' BASE_URL='$BASE_URL' bash -s" <<REMOTE
set -euo pipefail
tmp="/tmp/install-vps-infobiz-agents.sh"
curl -fsSL "$INSTALLER_URL" -o "\$tmp"
chmod +x "\$tmp"
"\$tmp"
REMOTE
