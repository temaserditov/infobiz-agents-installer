#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-on}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
WEB_SHELL_ROOT="${WEB_SHELL_ROOT:-$INSTALL_ROOT/web-shell}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST_ON="${WEB_SHELL_HOST_ON:-0.0.0.0}"
WEB_SHELL_HOST_OFF="${WEB_SHELL_HOST_OFF:-127.0.0.1}"
SUPPORT_ENV="$INSTALL_ROOT/support.env"
MACOS_WEB_SHELL_PLIST="$HOME/Library/LaunchAgents/com.infobiz.agents.web-shell.plist"
LINUX_WEB_SHELL_SERVICE="/etc/systemd/system/infobiz-web-shell.service"

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
  tmp_dir="${TMPDIR:-/tmp}/infobiz-support-web-shell.$$"
  payload="$tmp_dir/web-shell.tar.gz"
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir" "$WEB_SHELL_ROOT"
  say "Updating WebShell support code"
  curl -fsSL "$WEB_SHELL_URL" -o "$payload"
  tar -xzf "$payload" -C "$tmp_dir"
  source_dir="$tmp_dir/web-shell"
  [[ -d "$source_dir" ]] || fail "WebShell archive is invalid"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude runs \
      --exclude approvals \
      --exclude snapshots \
      --exclude preflights \
      --exclude uploads \
      "$source_dir/" "$WEB_SHELL_ROOT/"
  else
    cp -R "$source_dir/." "$WEB_SHELL_ROOT/"
  fi
  rm -rf "$tmp_dir"
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
  if grep -q "^Environment=$key=" "$LINUX_WEB_SHELL_SERVICE"; then
    sed -i "s|^Environment=$key=.*|Environment=$key=$value|" "$LINUX_WEB_SHELL_SERVICE"
  else
    sed -i "/^Environment=PATH=/i Environment=$key=$value" "$LINUX_WEB_SHELL_SERVICE"
  fi
}

service_delete_env() {
  local key="$1"
  sed -i "/^Environment=$key=/d" "$LINUX_WEB_SHELL_SERVICE"
}

restart_linux_web_shell() {
  systemctl daemon-reload
  systemctl restart infobiz-web-shell.service
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
  local i
  for i in $(seq 1 20); do
    if curl -fsS --max-time 2 "$url/api/agents" >/dev/null 2>&1; then
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
  wait_for_web_shell "$local_url" || printf "WARNING: WebShell did not answer yet. Try the links in 10-20 seconds.\n" >&2

  printf "\nРежим поддержки включен.\n"
  printf "Панель: %s\n" "$panel_url"
  printf "Диагностика для Codex: %s\n" "$support_url"
  printf "\nВыключить поддержку:\n"
  printf "/bin/bash -c \"\$(curl -fsSL 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/support-infobiz-agents.sh')\" -- off\n"
}

main "$@"
