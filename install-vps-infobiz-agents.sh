#!/usr/bin/env bash
set -euo pipefail

AGENT_PROFILES="${AGENT_PROFILES:-designer,copywriter,marketer,producer,tech}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,designer,copywriter,marketer,producer,tech}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
HERMES_BRANCH="${HERMES_BRANCH:-main}"
HERMES_SOURCE_URL="${HERMES_SOURCE_URL:-https://github.com/NousResearch/hermes-agent/archive/refs/heads/$HERMES_BRANCH.tar.gz}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
HERMES_EXTRAS="${HERMES_EXTRAS:-cli,mcp}"
NODE_VERSION="${NODE_VERSION:-22}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST="${WEB_SHELL_HOST:-0.0.0.0}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
WEB_SHELL_ACCESS_TOKEN="${WEB_SHELL_ACCESS_TOKEN:-}"

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/install.log"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
UV_CMD=""
TMP_ROOT="${TMPDIR:-/tmp}/infobiz-vps-install.$$"

export DEBIAN_FRONTEND=noninteractive
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HERMES_ROOT/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

say() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

format_seconds() {
  local seconds="$1"
  local minutes=$((seconds / 60))
  local rest=$((seconds % 60))
  if (( minutes > 0 )); then
    printf "%dm %02ds" "$minutes" "$rest"
  else
    printf "%ss" "$rest"
  fi
}

run_logged() {
  local label="$1"
  shift
  local start now elapsed exit_code pid
  start="$(date +%s)"
  printf "   %s... 0s" "$label"
  {
    printf "\n\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$label"
    printf "Command:"
    printf " %q" "$@"
    printf "\n"
  } >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1 &
  pid="$!"
  while kill -0 "$pid" >/dev/null 2>&1; do
    now="$(date +%s)"
    elapsed=$((now - start))
    printf "\r   %s... %s" "$label" "$(format_seconds "$elapsed")"
    sleep 1
  done
  set +e
  wait "$pid"
  exit_code=$?
  set -e
  elapsed=$(($(date +%s) - start))
  if (( exit_code == 0 )); then
    printf "\r   %s... done in %s\n" "$label" "$(format_seconds "$elapsed")"
  else
    printf "\r   %s... failed after %s\n" "$label" "$(format_seconds "$elapsed")"
  fi
  return "$exit_code"
}

download_file() {
  local url="$1"
  local output="$2"
  printf "   Downloading: %s\n" "$url"
  printf "Downloading: %s\n" "$url" >> "$LOG_FILE"
  curl -fL --progress-bar "$url" -o "$output" 2> >(tee -a "$LOG_FILE" >&2)
}

detect_public_host() {
  if [[ -n "$PUBLIC_HOST" ]]; then
    printf "%s" "$PUBLIC_HOST"
    return
  fi
  local ip
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "$ip" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf "%s" "$ip"
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || fail "VPS installer supports Linux only"
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) ;;
      *) printf "WARNING: tested on Ubuntu/Debian, current OS: %s\n" "${PRETTY_NAME:-unknown}" ;;
    esac
  fi
}

install_system_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    fail "apt-get not found. Use Ubuntu 24.04/22.04 or Debian."
  fi
  run_logged "Updating apt package index" apt-get update -y
  run_logged "Installing system packages" apt-get install -y ca-certificates curl tar xz-utils gzip rsync build-essential python3 python3-venv python3-pip openssl systemd
}

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    UV_CMD="$(command -v uv)"
    return
  fi
  if [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_CMD="$HOME/.local/bin/uv"
    return
  fi
  local installer="$TMP_ROOT/uv-install.sh"
  download_file "https://astral.sh/uv/install.sh" "$installer"
  chmod +x "$installer"
  run_logged "Installing uv package manager" sh "$installer"
  if [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_CMD="$HOME/.local/bin/uv"
  elif command -v uv >/dev/null 2>&1; then
    UV_CMD="$(command -v uv)"
  else
    fail "uv was not installed"
  fi
}

install_node_runtime() {
  local arch node_arch index_url tarball_name download_url tmp_dir extracted_dir
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *) fail "Unsupported CPU architecture: $arch" ;;
  esac
  if [[ -x "$HERMES_ROOT/node/bin/node" ]]; then
    export PATH="$HERMES_ROOT/node/bin:$PATH"
    return
  fi
  index_url="https://nodejs.org/dist/latest-v${NODE_VERSION}.x/"
  tarball_name="$(curl -fsSL "$index_url" | grep -oE "node-v${NODE_VERSION}\.[0-9]+\.[0-9]+-linux-${node_arch}\.tar\.xz" | head -1 || true)"
  [[ -n "$tarball_name" ]] || fail "Could not find Node.js Linux build"
  download_url="${index_url}${tarball_name}"
  tmp_dir="$TMP_ROOT/node"
  mkdir -p "$tmp_dir"
  download_file "$download_url" "$tmp_dir/$tarball_name"
  run_logged "Installing Node.js runtime" tar -xf "$tmp_dir/$tarball_name" -C "$tmp_dir"
  extracted_dir="$(find "$tmp_dir" -maxdepth 1 -type d -name 'node-v*' | head -1)"
  [[ -d "$extracted_dir" ]] || fail "Node.js archive layout is invalid"
  rm -rf "$HERMES_ROOT/node"
  mkdir -p "$HERMES_ROOT"
  mv "$extracted_dir" "$HERMES_ROOT/node"
  mkdir -p "$HOME/.local/bin"
  ln -sf "$HERMES_ROOT/node/bin/node" "$HOME/.local/bin/node"
  ln -sf "$HERMES_ROOT/node/bin/npm" "$HOME/.local/bin/npm"
  ln -sf "$HERMES_ROOT/node/bin/npx" "$HOME/.local/bin/npx"
  export PATH="$HERMES_ROOT/node/bin:$PATH"
}

install_hermes_from_source() {
  local source_tarball="$TMP_ROOT/hermes-agent-source.tar.gz"
  download_file "$HERMES_SOURCE_URL" "$source_tarball"
  rm -rf "$HERMES_AGENT_ROOT"
  mkdir -p "$HERMES_AGENT_ROOT"
  run_logged "Extracting Hermes source" tar --strip-components=1 -xzf "$source_tarball" -C "$HERMES_AGENT_ROOT"
  run_logged "Installing Python $PYTHON_VERSION" "$UV_CMD" python install "$PYTHON_VERSION"
  run_logged "Creating Hermes virtual environment" "$UV_CMD" venv "$HERMES_AGENT_ROOT/venv" --python "$PYTHON_VERSION"
  export VIRTUAL_ENV="$HERMES_AGENT_ROOT/venv"
  run_logged "Installing Hermes Python packages" bash -lc "cd '$HERMES_AGENT_ROOT' && '$UV_CMD' pip install --only-binary=:all: -e '.[${HERMES_EXTRAS}]'"
  run_logged "Installing Telegram support" "$UV_CMD" pip install --only-binary=:all: "python-telegram-bot[webhooks]==22.6" "aiohttp==3.13.3" "qrcode==7.4.2"
  mkdir -p "$HOME/.local/bin" "$HERMES_ROOT"/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,skills}
  ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"
  [[ -f "$HERMES_ROOT/.env" ]] || cp "$HERMES_AGENT_ROOT/.env.example" "$HERMES_ROOT/.env" 2>/dev/null || : > "$HERMES_ROOT/.env"
  [[ -f "$HERMES_ROOT/config.yaml" ]] || cp "$HERMES_AGENT_ROOT/cli-config.yaml.example" "$HERMES_ROOT/config.yaml" 2>/dev/null || true
  if [[ -f "$HERMES_AGENT_ROOT/tools/skills_sync.py" ]]; then
    HERMES_HOME="$HERMES_ROOT" "$HERMES_AGENT_ROOT/venv/bin/python" "$HERMES_AGENT_ROOT/tools/skills_sync.py" >> "$LOG_FILE" 2>&1 || true
  fi
}

run_hermes() {
  HERMES_HOME="$HERMES_ROOT" \
  PATH="$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$PATH" \
  "$HERMES_CMD" "$@"
}

create_clean_profile() {
  local profile="$1"
  rm -rf "$HERMES_ROOT/profiles/$profile"
  (
    cd "$HERMES_AGENT_ROOT"
    HERMES_HOME="$HERMES_ROOT" "$HERMES_AGENT_ROOT/venv/bin/python" - "$profile" <<'PY'
import sys
from hermes_cli.profiles import create_profile, seed_profile_skills
profile_dir = create_profile(sys.argv[1], no_alias=True)
seed_profile_skills(profile_dir, quiet=True)
print(profile_dir)
PY
  ) >> "$LOG_FILE" 2>&1
}

write_profile_env() {
  local profile="$1"
  local profile_root
  if [[ "$profile" == "default" ]]; then
    profile_root="$HERMES_ROOT"
  else
    profile_root="$HERMES_ROOT/profiles/$profile"
  fi
  cat > "$profile_root/.env" <<ENV
TELEGRAM_BOT_TOKEN=''
GATEWAY_ALLOW_ALL_USERS='true'
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_HOME='$profile_root'
WEB_SHELL_API_URL='http://127.0.0.1:$WEB_SHELL_PORT'
PATH='$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
ENV
  chmod 600 "$profile_root/.env"
}

enable_telegram_platform() {
  local config_path="$1/config.yaml"
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$config_path" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
if "platforms:" in text and "  telegram:" in text and "    enabled: true" in text:
    raise SystemExit(0)
text = text.rstrip() + "\n\n# Infobiz Agents messaging defaults\nplatforms:\n  telegram:\n    enabled: true\n"
path.write_text(text)
PY
}

install_profiles_and_skills() {
  local payload="$TMP_ROOT/profile.tar.gz"
  local workdir="$TMP_ROOT/profile"
  local profile
  download_file "$PROFILE_URL" "$payload"
  mkdir -p "$workdir"
  run_logged "Extracting agent skills" tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/profile/skills" ]] || fail "Profile payload is invalid"

  mkdir -p "$HERMES_ROOT/profiles"
  IFS=',' read -r -a profiles <<< "$AGENT_PROFILES"
  for profile in "${profiles[@]}"; do
    profile="$(echo "$profile" | xargs)"
    [[ -n "$profile" ]] || continue
    say "Creating profile: $profile"
    create_clean_profile "$profile"
    mkdir -p "$HERMES_ROOT/profiles/$profile/skills"
    if [[ "$profile" == "marketer" ]]; then
      rsync -a "$workdir/profile/skills/" "$HERMES_ROOT/profiles/$profile/skills/"
    elif [[ -d "$workdir/profile/skills/webshell-docs" ]]; then
      rsync -a "$workdir/profile/skills/webshell-docs" "$HERMES_ROOT/profiles/$profile/skills/"
    fi
    write_profile_env "$profile"
    enable_telegram_platform "$HERMES_ROOT/profiles/$profile"
  done

  if [[ -d "$workdir/profile/skills/webshell-docs" ]]; then
    rm -rf "$HERMES_ROOT/skills/webshell-docs"
    rsync -a "$workdir/profile/skills/webshell-docs" "$HERMES_ROOT/skills/"
  fi
  write_profile_env "default"
  enable_telegram_platform "$HERMES_ROOT"
}

install_web_shell() {
  local payload="$TMP_ROOT/web-shell.tar.gz"
  local workdir="$TMP_ROOT/web-shell"
  download_file "$WEB_SHELL_URL" "$payload"
  mkdir -p "$workdir"
  run_logged "Extracting WebShell" tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/web-shell" ]] || fail "WebShell payload is invalid"
  rm -rf "$WEB_SHELL_ROOT"
  mkdir -p "$INSTALL_ROOT"
  cp -a "$workdir/web-shell" "$WEB_SHELL_ROOT"
  mkdir -p "$INSTALL_ROOT/workspace" "$INSTALL_ROOT/obsidian-vault" "$HOME/.hermes-workspaces"
}

install_systemd_services() {
  local node_cmd="$HERMES_ROOT/node/bin/node"
  [[ -x "$node_cmd" ]] || node_cmd="$(command -v node)"
  [[ -n "$WEB_SHELL_ACCESS_TOKEN" ]] || WEB_SHELL_ACCESS_TOKEN="$(openssl rand -hex 24)"
  cat > /etc/systemd/system/infobiz-web-shell.service <<SERVICE
[Unit]
Description=Infobiz Agents WebShell
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$WEB_SHELL_ROOT
ExecStart=$node_cmd $WEB_SHELL_ROOT/server.mjs
Restart=always
RestartSec=3
Environment=PORT=$WEB_SHELL_PORT
Environment=HOST=$WEB_SHELL_HOST
Environment=HERMES_ROOT=$HERMES_ROOT
Environment=HERMES_AGENT_ROOT=$HERMES_AGENT_ROOT
Environment=HERMES_PYTHON=$HERMES_AGENT_ROOT/venv/bin/python
Environment=HERMES_WORKSPACES_ROOT=$HOME/.hermes-workspaces
Environment=AGENT_WORKSPACE=$INSTALL_ROOT/workspace
Environment=OBSIDIAN_VAULT=$INSTALL_ROOT/obsidian-vault
Environment=AGENT_PROFILE_ALLOW=$AGENT_PROFILE_ALLOW
Environment=WEB_SHELL_API_URL=http://127.0.0.1:$WEB_SHELL_PORT
Environment=WEB_SHELL_ACCESS_TOKEN=$WEB_SHELL_ACCESS_TOKEN
Environment=PATH=$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable --now infobiz-web-shell.service
  cat > "$INSTALL_ROOT/vps.env" <<ENV
WEB_SHELL_ACCESS_TOKEN='$WEB_SHELL_ACCESS_TOKEN'
WEB_SHELL_PORT='$WEB_SHELL_PORT'
AGENT_PROFILE_ALLOW='$AGENT_PROFILE_ALLOW'
ENV
  chmod 600 "$INSTALL_ROOT/vps.env"
}

install_gateway_systemd_services() {
  local profile service profile_arg
  for profile in default designer copywriter marketer producer tech; do
    if [[ "$profile" == "default" ]]; then
      service="infobiz-hermes-gateway.service"
      profile_arg=""
    else
      [[ -d "$HERMES_ROOT/profiles/$profile" ]] || continue
      service="infobiz-hermes-gateway-$profile.service"
      profile_arg="-p $profile"
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
ExecStart=$HERMES_CMD $profile_arg gateway run
Restart=always
RestartSec=5
Environment=HERMES_HOME=$HERMES_ROOT
Environment=PATH=$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

[Install]
WantedBy=multi-user.target
SERVICE
    systemctl daemon-reload
    systemctl enable --now "$service" || true
  done
}

open_firewall_if_available() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "$WEB_SHELL_PORT/tcp" >/dev/null 2>&1 || true
  fi
}

run_openai_auth() {
  say "OpenAI/Hermes authorization"
  printf "Follow the device-code instructions below. Open the URL on your computer or phone.\n"
  run_hermes auth add openai-codex
}

main() {
  mkdir -p "$INSTALL_ROOT" "$TMP_ROOT"
  : > "$LOG_FILE"
  printf "Infobiz Agents VPS install log\nStarted: %s\n" "$(date)" >> "$LOG_FILE"
  require_linux
  say "Installing Infobiz Agents VPS stack"
  install_system_packages
  ensure_uv
  install_node_runtime
  install_hermes_from_source
  install_profiles_and_skills
  run_openai_auth
  install_web_shell
  install_systemd_services
  install_gateway_systemd_services
  open_firewall_if_available

  public_host="$(detect_public_host)"
  public_url="http://$public_host:$WEB_SHELL_PORT/?token=$WEB_SHELL_ACCESS_TOKEN"
  printf "%s\n" "$public_url" > "$INSTALL_ROOT/web-shell.url"

  say "Done"
  printf "Панель агентов:\n%s\n\n" "$public_url"
  printf "Локальный API для агентов:\nhttp://127.0.0.1:%s\n\n" "$WEB_SHELL_PORT"
  printf "Лог установки:\n%s\n" "$LOG_FILE"
}

main "$@"
