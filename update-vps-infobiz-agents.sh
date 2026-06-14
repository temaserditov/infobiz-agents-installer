#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
TMP_ROOT="${TMPDIR:-/tmp}/infobiz-vps-update.$$"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,marketer,copywriter,designer,tech}"
AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

say() {
  printf "==> %s\n" "$1"
}

repair_gateway_systemd_services() {
  local profile service profile_home
  command -v systemctl >/dev/null 2>&1 || return 0
  systemctl disable --now infobiz-hermes-gateway-producer.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/infobiz-hermes-gateway-producer.service
  for profile in default marketer copywriter designer tech; do
    if [[ "$profile" == "default" ]]; then
      service="infobiz-hermes-gateway.service"
      profile_home="$HERMES_ROOT"
    else
      [[ -d "$HERMES_ROOT/profiles/$profile" ]] || continue
      service="infobiz-hermes-gateway-$profile.service"
      profile_home="$HERMES_ROOT/profiles/$profile"
    fi
    cat > "/etc/systemd/system/$service" <<SERVICE
[Unit]
Description=Infobiz Hermes Gateway $profile
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$INSTALL_ROOT/workspace
ExecStart=$HERMES_CMD gateway run
Restart=always
RestartSec=5
Environment=HERMES_HOME=$profile_home
Environment=PATH=$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

[Install]
WantedBy=multi-user.target
SERVICE
    systemctl enable "$service" >/dev/null 2>&1 || true
  done
  systemctl daemon-reload
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

say "Downloading agent profiles update"
curl -fsSL "$PROFILE_URL" -o "$TMP_ROOT/agent-profiles.tar.gz"

say "Extracting agent profiles update"
mkdir -p "$TMP_ROOT/profiles"
tar -xzf "$TMP_ROOT/agent-profiles.tar.gz" -C "$TMP_ROOT/profiles"

if [[ ! -d "$TMP_ROOT/profiles/profile/agents" && ! -d "$TMP_ROOT/profiles/profile/skills" ]]; then
  echo "Invalid agent profiles archive." >&2
  exit 1
fi

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

say "Updating agent profiles"
IFS=',' read -r -a profiles <<< "$AGENT_PROFILES"
for profile in "${profiles[@]}"; do
  profile="$(echo "$profile" | xargs)"
  [[ -n "$profile" ]] || continue
  mkdir -p "$HERMES_ROOT/profiles/$profile"
  if [[ -d "$TMP_ROOT/profiles/profile/agents/$profile" ]]; then
    rsync -a \
      --exclude '.env' \
      --exclude 'config.yaml' \
      --exclude 'sessions/' \
      --exclude 'logs/' \
      --exclude 'memories/' \
      --exclude 'cron/' \
      --exclude 'gateway.pid' \
      "$TMP_ROOT/profiles/profile/agents/$profile/" "$HERMES_ROOT/profiles/$profile/"
  elif [[ -d "$TMP_ROOT/profiles/profile/skills" ]]; then
    mkdir -p "$HERMES_ROOT/profiles/$profile/skills"
    rsync -a "$TMP_ROOT/profiles/profile/skills/" "$HERMES_ROOT/profiles/$profile/skills/"
  fi
done

if [[ -d "$TMP_ROOT/profiles/profile/default" ]]; then
  rsync -a \
    --exclude '.env' \
    --exclude 'config.yaml' \
    --exclude 'sessions/' \
    --exclude 'logs/' \
    --exclude 'memories/' \
    --exclude 'profiles/' \
    --exclude 'hermes-agent/' \
    --exclude 'node/' \
    "$TMP_ROOT/profiles/profile/default/" "$HERMES_ROOT/"
fi

if [[ -d "$TMP_ROOT/profiles/profile/skills/webshell-docs" ]]; then
  mkdir -p "$HERMES_ROOT/skills"
  rm -rf "$HERMES_ROOT/skills/webshell-docs"
  rsync -a "$TMP_ROOT/profiles/profile/skills/webshell-docs" "$HERMES_ROOT/skills/"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now infobiz-hermes-gateway-producer.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/infobiz-hermes-gateway-producer.service
  if [[ -f /etc/systemd/system/infobiz-web-shell.service ]]; then
    sed -i "s/^Environment=AGENT_PROFILE_ALLOW=.*/Environment=AGENT_PROFILE_ALLOW=$AGENT_PROFILE_ALLOW/" /etc/systemd/system/infobiz-web-shell.service
    systemctl daemon-reload
  fi
fi

say "Repairing gateway services"
repair_gateway_systemd_services

if [[ -f "$INSTALL_ROOT/vps.env" ]]; then
  if grep -q '^AGENT_PROFILE_ALLOW=' "$INSTALL_ROOT/vps.env"; then
    sed -i "s/^AGENT_PROFILE_ALLOW=.*/AGENT_PROFILE_ALLOW='$AGENT_PROFILE_ALLOW'/" "$INSTALL_ROOT/vps.env"
  else
    printf "AGENT_PROFILE_ALLOW='%s'\n" "$AGENT_PROFILE_ALLOW" >> "$INSTALL_ROOT/vps.env"
  fi
fi

say "Restarting WebShell"
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart infobiz-web-shell.service
  systemctl restart infobiz-hermes-gateway.service >/dev/null 2>&1 || true
  systemctl restart infobiz-hermes-gateway-marketer.service >/dev/null 2>&1 || true
  systemctl restart infobiz-hermes-gateway-copywriter.service >/dev/null 2>&1 || true
  systemctl restart infobiz-hermes-gateway-designer.service >/dev/null 2>&1 || true
  systemctl restart infobiz-hermes-gateway-tech.service >/dev/null 2>&1 || true
fi

say "Update complete"
