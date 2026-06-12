#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
TMP_ROOT="${TMPDIR:-/tmp}/infobiz-vps-update.$$"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

say() {
  printf "==> %s\n" "$1"
}

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This updater supports Linux VPS only." >&2
  exit 1
fi

if [[ ! -d "$WEB_SHELL_ROOT" ]]; then
  echo "WebShell is not installed at $WEB_SHELL_ROOT. Run the full installer first." >&2
  exit 1
fi

mkdir -p "$TMP_ROOT"

say "Downloading WebShell update"
curl -fsSL "$WEB_SHELL_URL" -o "$TMP_ROOT/agent-web-shell.tar.gz"

say "Extracting WebShell update"
tar -xzf "$TMP_ROOT/agent-web-shell.tar.gz" -C "$TMP_ROOT"

if [[ ! -d "$TMP_ROOT/web-shell" ]]; then
  echo "Invalid WebShell archive." >&2
  exit 1
fi

say "Updating WebShell files"
rsync -a --delete \
  --exclude 'docs.json' \
  --exclude 'groups.json' \
  --exclude 'runs/' \
  --exclude 'preflights/' \
  --exclude 'snapshots/' \
  --exclude 'uploads/' \
  --exclude 'approvals/' \
  "$TMP_ROOT/web-shell/" "$WEB_SHELL_ROOT/"

say "Restarting WebShell"
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart infobiz-web-shell.service
fi

say "Update complete"
