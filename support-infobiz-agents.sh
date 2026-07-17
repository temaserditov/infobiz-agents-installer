#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-on}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
WEB_SHELL_ROOT="${WEB_SHELL_ROOT:-$INSTALL_ROOT/web-shell}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST_ON="${WEB_SHELL_HOST_ON:-0.0.0.0}"
WEB_SHELL_HOST_OFF="${WEB_SHELL_HOST_OFF:-127.0.0.1}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="${HERMES_AGENT_ROOT:-$HERMES_ROOT/hermes-agent}"
AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"
SUPPORT_ENV="$INSTALL_ROOT/support.env"
MACOS_WEB_SHELL_PLIST="${MACOS_WEB_SHELL_PLIST:-$HOME/Library/LaunchAgents/com.infobiz.agents.web-shell.plist}"
LINUX_WEB_SHELL_SERVICE="${LINUX_WEB_SHELL_SERVICE:-/etc/systemd/system/infobiz-web-shell.service}"

say() {
  printf "==> %s\n" "$1"
}

fail() {
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

shell_quote() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g; 1s/^/'/; \$s/\$/'/"
}

random_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
    return
  fi
  date +%s | shasum -a 256 | awk '{print $1}'
}

detect_port_macos() {
  if [[ -f "$MACOS_WEB_SHELL_PLIST" ]] && [[ -x /usr/libexec/PlistBuddy ]]; then
    /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:PORT" "$MACOS_WEB_SHELL_PLIST" 2>/dev/null || true
  fi
}

detect_port_linux() {
  if [[ -f "$LINUX_WEB_SHELL_SERVICE" ]]; then
    sed -n 's/^Environment=PORT=//p' "$LINUX_WEB_SHELL_SERVICE" | tail -1
  fi
}

detect_port() {
  local port=""
  case "$(uname -s)" in
    Darwin) port="$(detect_port_macos)" ;;
    Linux) port="$(detect_port_linux)" ;;
  esac
  printf "%s" "${port:-$WEB_SHELL_PORT}"
}

detect_lan_ip() {
  local ip=""
  case "$(uname -s)" in
    Darwin)
      ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
      [[ -n "$ip" ]] || ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
      ;;
    Linux)
      ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
      if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
        ip="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
      fi
      ;;
  esac
  printf "%s" "${ip:-127.0.0.1}"
}

update_web_shell_payload() {
  local tmp_dir payload source_dir
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-support-web-shell.XXXXXX")"
  payload="$tmp_dir/web-shell.tar.gz"
  mkdir -p "$WEB_SHELL_ROOT"
  say "Updating WebShell support code"
  curl -fsSL "$WEB_SHELL_URL" -o "$payload"
  tar -xzf "$payload" -C "$tmp_dir"
  source_dir="$tmp_dir/web-shell"
  [[ -d "$source_dir" ]] || fail "WebShell archive is invalid"
  command -v rsync >/dev/null 2>&1 || fail "rsync is required for a safe support update"
  rsync -a --delete \
    --exclude runs \
    --exclude approvals \
    --exclude snapshots \
    --exclude preflights \
    --exclude uploads \
    --exclude docs.json \
    --exclude groups.json \
    --exclude agent-overrides.json \
    --exclude baseline.json \
    "$source_dir/" "$WEB_SHELL_ROOT/"
  rm -rf "$tmp_dir"
}

update_profile_payload() {
  local tmp_dir payload profile source_dir profile_root skill_dir skill_name
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-support-profiles.XXXXXX")"
  payload="$tmp_dir/profiles.tar.gz"
  say "Updating agent profiles"
  curl -fsSL "$PROFILE_URL" -o "$payload"
  tar -xzf "$payload" -C "$tmp_dir"
  [[ -d "$tmp_dir/profile" ]] || fail "Agent profile archive is invalid"
  command -v rsync >/dev/null 2>&1 || fail "rsync is required for a safe profile update"

  IFS=',' read -r -a profiles <<< "$AGENT_PROFILES"
  for profile in "${profiles[@]}"; do
    profile="$(printf "%s" "$profile" | xargs)"
    [[ -n "$profile" ]] || continue
    source_dir="$tmp_dir/profile/agents/$profile"
    [[ -d "$source_dir" ]] || continue
    profile_root="$HERMES_ROOT/profiles/$profile"
    mkdir -p "$profile_root"
    rsync -a \
      --exclude '.env' --exclude '.env.*' \
      --exclude 'auth.json' --exclude 'auth.json.*' --exclude 'auth.lock' \
      --exclude 'config.yaml' --exclude 'config.yaml.*' \
      --exclude 'sessions/' --exclude 'logs/' --exclude 'memories/' \
      --exclude 'home/' --exclude 'workspace/' --exclude 'plans/' --exclude 'local/' \
      --exclude 'MEMORY.md' --exclude 'USER.md' --exclude 'LEARNING.md' \
      --exclude 'skills/' --exclude 'cache/' --exclude 'cron/' \
      --exclude 'state.db*' --exclude 'response_store.db*' \
      --exclude 'gateway.pid' --exclude 'gateway.lock' --exclude 'gateway_state.json' \
      --exclude '.restart*' \
      "$source_dir/" "$profile_root/"
    if [[ -d "$source_dir/skills" ]]; then
      mkdir -p "$profile_root/skills"
      for skill_dir in "$source_dir"/skills/*; do
        [[ -d "$skill_dir" ]] || continue
        skill_name="$(basename "$skill_dir")"
        rm -rf "$profile_root/skills/$skill_name"
        rsync -a "$skill_dir/" "$profile_root/skills/$skill_name/"
      done
    fi
  done

  if [[ -f "$tmp_dir/profile/default/SOUL.md" ]]; then
    cp "$tmp_dir/profile/default/SOUL.md" "$HERMES_ROOT/SOUL.md"
  fi
  if [[ -d "$tmp_dir/profile/skills/webshell-docs" ]]; then
    rm -rf "$HERMES_ROOT/skills/webshell-docs"
    mkdir -p "$HERMES_ROOT/skills/webshell-docs"
    rsync -a "$tmp_dir/profile/skills/webshell-docs/" "$HERMES_ROOT/skills/webshell-docs/"
  fi
  rm -rf "$tmp_dir"
}

repair_profile_runtime_config() {
  local py profile profile_root
  py="$HERMES_AGENT_ROOT/venv/bin/python"
  [[ -x "$py" ]] || py="$(command -v python3 || true)"
  [[ -n "$py" ]] || return 0
  for profile in marketer copywriter designer tech; do
    profile_root="$HERMES_ROOT/profiles/$profile"
    [[ -d "$profile_root" ]] || continue
    "$py" - "$profile_root/config.yaml" <<'PY' || true
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
if re.search(r"(?m)^kanban:\s*$", text):
    if re.search(r"(?m)^  dispatch_in_gateway:\s*(?:true|false)\s*$", text):
        text = re.sub(r"(?m)^  dispatch_in_gateway:\s*(?:true|false)\s*$", "  dispatch_in_gateway: false", text)
    else:
        text = re.sub(r"(?m)^kanban:\s*$", "kanban:\n  dispatch_in_gateway: false", text, count=1)
else:
    text = text.rstrip() + "\n\n# Infobiz Agents multi-gateway defaults\nkanban:\n  dispatch_in_gateway: false\n"
path.write_text(text)
PY
    if [[ -f "$profile_root/.env" ]] && ! grep -q '^HERMES_KANBAN_DISPATCH_IN_GATEWAY=' "$profile_root/.env"; then
      printf "HERMES_KANBAN_DISPATCH_IN_GATEWAY='false'\n" >> "$profile_root/.env"
    fi
  done
}

write_support_env() {
  local token="$1"
  local port="$2"
  mkdir -p "$INSTALL_ROOT"
  {
    printf "WEB_SHELL_ACCESS_TOKEN=%s\n" "$(shell_quote "$token")"
    printf "WEB_SHELL_PORT=%s\n" "$(shell_quote "$port")"
    printf "WEB_SHELL_HOST=%s\n" "$(shell_quote "$WEB_SHELL_HOST_ON")"
  } > "$SUPPORT_ENV"
  chmod 600 "$SUPPORT_ENV"
}

plist_set_env() {
  local key="$1"
  local value="$2"
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:$key $value" "$MACOS_WEB_SHELL_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:$key string $value" "$MACOS_WEB_SHELL_PLIST"
}

plist_delete_env() {
  local key="$1"
  /usr/libexec/PlistBuddy -c "Delete :EnvironmentVariables:$key" "$MACOS_WEB_SHELL_PLIST" >/dev/null 2>&1 || true
}

restart_macos_web_shell() {
  local uid
  uid="$(id -u)"
  launchctl bootout "gui/$uid" "$MACOS_WEB_SHELL_PLIST" >/dev/null 2>&1 || true
  launchctl remove "com.infobiz.agents.web-shell" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$uid" "$MACOS_WEB_SHELL_PLIST" >/dev/null 2>&1 || launchctl load "$MACOS_WEB_SHELL_PLIST" >/dev/null 2>&1
  launchctl kickstart -k "gui/$uid/com.infobiz.agents.web-shell" >/dev/null 2>&1 || true
}

enable_macos() {
  local token="$1"
  local port="$2"
  [[ -d "$WEB_SHELL_ROOT" ]] || fail "WebShell не найден: $WEB_SHELL_ROOT"
  [[ -f "$MACOS_WEB_SHELL_PLIST" ]] || fail "LaunchAgent не найден: $MACOS_WEB_SHELL_PLIST"
  [[ -x /usr/libexec/PlistBuddy ]] || fail "PlistBuddy не найден"
  plist_set_env "HOST" "$WEB_SHELL_HOST_ON"
  plist_set_env "WEB_SHELL_ACCESS_TOKEN" "$token"
  plist_set_env "PORT" "$port"
  restart_macos_web_shell
}

disable_macos() {
  [[ -f "$MACOS_WEB_SHELL_PLIST" ]] || fail "LaunchAgent не найден: $MACOS_WEB_SHELL_PLIST"
  plist_set_env "HOST" "$WEB_SHELL_HOST_OFF"
  plist_delete_env "WEB_SHELL_ACCESS_TOKEN"
  restart_macos_web_shell
}

service_set_env() {
  local key="$1"
  local value="$2"
  if [[ "$key" == "WEB_SHELL_ACCESS_TOKEN" ]] && grep -q '^EnvironmentFile=' "$LINUX_WEB_SHELL_SERVICE"; then
    local env_file tmp_file
    env_file="$(sed -n 's/^EnvironmentFile=-\{0,1\}//p' "$LINUX_WEB_SHELL_SERVICE" | tail -1)"
    [[ -n "$env_file" ]] || env_file="$INSTALL_ROOT/vps.env"
    mkdir -p "$(dirname "$env_file")"
    tmp_file="$env_file.tmp.$$"
    awk -v key="$key" -v value="$value" '
      BEGIN { found=0 }
      index($0, key "=") == 1 { print key "=\047" value "\047"; found=1; next }
      { print }
      END { if (!found) print key "=\047" value "\047" }
    ' "$env_file" 2>/dev/null > "$tmp_file" || printf "%s='%s'\n" "$key" "$value" > "$tmp_file"
    mv "$tmp_file" "$env_file"
    chmod 600 "$env_file"
    tmp_file="$LINUX_WEB_SHELL_SERVICE.tmp.$$"
    awk -v prefix="Environment=$key=" 'index($0, prefix) != 1 { print }' "$LINUX_WEB_SHELL_SERVICE" > "$tmp_file"
    mv "$tmp_file" "$LINUX_WEB_SHELL_SERVICE"
    chmod 644 "$LINUX_WEB_SHELL_SERVICE"
    return
  fi
  local tmp_file="$LINUX_WEB_SHELL_SERVICE.tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { found=0; prefix="Environment=" key "=" }
    index($0, prefix) == 1 { print prefix value; found=1; next }
    /^Environment=PATH=/ && !found { print prefix value; found=1 }
    { print }
    END { if (!found) print prefix value }
  ' "$LINUX_WEB_SHELL_SERVICE" > "$tmp_file"
  mv "$tmp_file" "$LINUX_WEB_SHELL_SERVICE"
  chmod 644 "$LINUX_WEB_SHELL_SERVICE"
}

service_delete_env() {
  local key="$1"
  if [[ "$key" == "WEB_SHELL_ACCESS_TOKEN" ]] && grep -q '^EnvironmentFile=' "$LINUX_WEB_SHELL_SERVICE"; then
    local env_file tmp_file
    env_file="$(sed -n 's/^EnvironmentFile=-\{0,1\}//p' "$LINUX_WEB_SHELL_SERVICE" | tail -1)"
    if [[ -n "$env_file" && -f "$env_file" ]]; then
      tmp_file="$env_file.tmp.$$"
      awk -v key="$key" 'index($0, key "=") != 1 { print }' "$env_file" > "$tmp_file"
      mv "$tmp_file" "$env_file"
      chmod 600 "$env_file"
    fi
  fi
  local unit_tmp="$LINUX_WEB_SHELL_SERVICE.tmp.$$"
  awk -v prefix="Environment=$key=" 'index($0, prefix) != 1 { print }' "$LINUX_WEB_SHELL_SERVICE" > "$unit_tmp"
  mv "$unit_tmp" "$LINUX_WEB_SHELL_SERVICE"
  chmod 644 "$LINUX_WEB_SHELL_SERVICE"
}

restart_linux_web_shell() {
  systemctl daemon-reload
  systemctl restart infobiz-web-shell.service
}

restart_gateway_services() {
  local os uid profile label service
  os="$(uname -s)"
  case "$os" in
    Darwin)
      uid="$(id -u)"
      for profile in default marketer copywriter designer tech; do
        if [[ "$profile" == "default" ]]; then
          label="ai.hermes.gateway"
        else
        label="ai.hermes.gateway-$profile"
        fi
        launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1 || true
      done
      ;;
    Linux)
      command -v systemctl >/dev/null 2>&1 || return 0
      systemctl restart infobiz-hermes-gateway.service >/dev/null 2>&1 || true
      for profile in marketer copywriter designer tech; do
        service="infobiz-hermes-gateway-$profile.service"
        systemctl restart "$service" >/dev/null 2>&1 || true
      done
      ;;
  esac
}

enable_linux() {
  local token="$1"
  local port="$2"
  [[ -d "$WEB_SHELL_ROOT" ]] || fail "WebShell не найден: $WEB_SHELL_ROOT"
  [[ -f "$LINUX_WEB_SHELL_SERVICE" ]] || fail "systemd service не найден: $LINUX_WEB_SHELL_SERVICE"
  service_set_env "HOST" "$WEB_SHELL_HOST_ON"
  service_set_env "WEB_SHELL_ACCESS_TOKEN" "$token"
  service_set_env "PORT" "$port"
  restart_linux_web_shell
}

disable_linux() {
  [[ -f "$LINUX_WEB_SHELL_SERVICE" ]] || fail "systemd service не найден: $LINUX_WEB_SHELL_SERVICE"
  service_set_env "HOST" "$WEB_SHELL_HOST_OFF"
  service_delete_env "WEB_SHELL_ACCESS_TOKEN"
  restart_linux_web_shell
}

wait_for_web_shell() {
  local url="$1"
  local token="${2:-}"
  local i
  for i in $(seq 1 20); do
    if curl -fsS --max-time 2 "$url/api/agents?token=$token" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

main() {
  local os port token ip panel_url support_url local_url
  os="$(uname -s)"
  port="$(detect_port)"

  if [[ "$MODE" == "off" || "$MODE" == "disable" ]]; then
    say "Disabling temporary Infobiz support access"
    case "$os" in
      Darwin) disable_macos ;;
      Linux) disable_linux ;;
      *) fail "Unsupported OS: $os" ;;
    esac
    rm -f "$SUPPORT_ENV"
    say "Support access disabled"
    return
  fi

  token="$(random_token)"
  write_support_env "$token" "$port"
  say "Enabling temporary Infobiz support access"
  update_web_shell_payload
  case "$os" in
    Darwin) enable_macos "$token" "$port" ;;
    Linux) enable_linux "$token" "$port" ;;
    *) fail "Unsupported OS: $os" ;;
  esac

  ip="$(detect_lan_ip)"
  panel_url="http://$ip:$port/?token=$token"
  support_url="http://$ip:$port/api/support/bundle?token=$token"
  local_url="http://127.0.0.1:$port"
  wait_for_web_shell "$local_url" "$token" || printf "WARNING: WebShell did not answer yet. Try the links in 10-20 seconds.\n" >&2

  printf "\nРежим поддержки включен.\n"
  printf "Панель: %s\n" "$panel_url"
  printf "Диагностика для Codex: %s\n" "$support_url"
  printf "\nВыключить поддержку:\n"
  printf "/bin/bash -c \"\$(curl -fsSL 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/support-infobiz-agents.sh')\" -- off\n"
}

main "$@"
