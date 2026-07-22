#!/usr/bin/env bash
set -Eeuo pipefail

AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,marketer,copywriter,designer,tech}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
HERMES_BRANCH="${HERMES_BRANCH:-}"
HERMES_SOURCE_URL="${HERMES_SOURCE_URL:-}"
HERMES_RELEASE_API="${HERMES_RELEASE_API:-https://api.github.com/repos/NousResearch/hermes-agent/releases/latest}"
HERMES_FALLBACK_TAG="${HERMES_FALLBACK_TAG:-v2026.7.7.2}"
HERMES_SOURCE_REF=""
HERMES_IMAGE_REFERENCE_PATCH_URL="${HERMES_IMAGE_REFERENCE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-image-reference.py}"
HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL="${HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-telegram-text-photo-merge.py}"
HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL="${HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-local-media-markdown.py}"
HERMES_RUNTIME_SAFETY_PATCH_URL="${HERMES_RUNTIME_SAFETY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-codex-runtime-safety.py}"
HERMES_TELEGRAM_RELIABILITY_PATCH_URL="${HERMES_TELEGRAM_RELIABILITY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-telegram-reliability.py}"
HERMES_SESSION_HISTORY_REPAIR_URL="${HERMES_SESSION_HISTORY_REPAIR_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/repair-hermes-session-history.py}"
AGENT_RUSSIAN_ONLY_PATCH_URL="${AGENT_RUSSIAN_ONLY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-agent-russian-only.py}"
UPDATE_SCRIPT_URL="${UPDATE_SCRIPT_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-vps-infobiz-agents.sh}"
FORCE_REINSTALL="${FORCE_REINSTALL:-0}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
NODE_VERSION="${NODE_VERSION:-22}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST="${WEB_SHELL_HOST:-0.0.0.0}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
WEB_SHELL_PUBLIC_URL="${WEB_SHELL_PUBLIC_URL:-}"
WEB_SHELL_ACCESS_TOKEN="${WEB_SHELL_ACCESS_TOKEN:-}"
STUDENT_UI="${STUDENT_UI:-1}"
INFOBIZ_INSIDE_TMUX="${INFOBIZ_INSIDE_TMUX:-0}"
TMUX_SESSION_NAME="${TMUX_SESSION_NAME:-}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-10}"
CURL_MAX_TIME="${CURL_MAX_TIME:-180}"
TMUX_BOOTSTRAP_TIMEOUT="${TMUX_BOOTSTRAP_TIMEOUT:-300}"
TMUX_STATUS_WAIT_SECONDS="${TMUX_STATUS_WAIT_SECONDS:-3600}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"

session_key_for_value() {
  local value="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$value" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$value" | shasum -a 256 | awk '{print $1}'
  else
    printf '%s' "$value" | cksum | awk '{print $1}'
  fi
}

if [[ -z "$TMUX_SESSION_NAME" ]]; then
  TMUX_SESSION_KEY="$(session_key_for_value "$INSTALL_ROOT")"
  TMUX_SESSION_NAME="infobiz-agents-install-v2-${TMUX_SESSION_KEY:0:12}"
fi

HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/install.log"
INSTALL_COMPLETE_MARKER="$INSTALL_ROOT/.install-complete"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
UV_CMD=""
TMP_ROOT="${TMPDIR:-/tmp}/infobiz-vps-install.$$"
UV_INSTALLED_MARKER="$INSTALL_ROOT/.uv-installed-by-infobiz"
NODE_INSTALLED_MARKER="$INSTALL_ROOT/.node-installed-by-infobiz"
PROGRESS_STEP=0
PROGRESS_TOTAL=11
PREVIOUS_HERMES_BACKUP=""
PREVIOUS_WEB_SHELL_BACKUP=""
INSTALL_COMPLETED=0
CURRENT_STAGE="Подготовка"
FAILURE_MESSAGE=""
ERROR_LINE=""
ERROR_COMMAND=""

export DEBIAN_FRONTEND=noninteractive
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HERMES_ROOT/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

say() {
  if [[ "$STUDENT_UI" == "1" ]]; then
    printf "\n==> %s\n" "$1" >> "$LOG_FILE"
  else
    printf "\n==> %s\n" "$1"
  fi
}

render_progress() {
  [[ "$STUDENT_UI" == "1" ]] || return 0
  local label="$1"
  local percent=$((PROGRESS_STEP * 100 / PROGRESS_TOTAL))
  local width=42
  local filled=$((percent * width / 100))
  local empty=$((width - filled))
  local bar spaces
  bar="$(printf '%*s' "$filled" '' | tr ' ' '#')"
  spaces="$(printf '%*s' "$empty" '')"
  printf "\033[2J\033[H"
  printf "Идет установка агентов\n\n"
  printf "%s\n\n" "$label"
  printf "[\033[32m%s\033[0m%s] %s%%\n" "$bar" "$spaces" "$percent"
  printf "\nНе закрывайте терминал. Если сеть замедлится, установщик повторит загрузку сам.\n"
}

progress_stage() {
  local label="$1"
  CURRENT_STAGE="$label"
  if (( PROGRESS_STEP < PROGRESS_TOTAL )); then
    PROGRESS_STEP=$((PROGRESS_STEP + 1))
  fi
  render_progress "$label"
}

fail() {
  FAILURE_MESSAGE="$1"
  [[ "$STUDENT_UI" == "1" ]] && printf "\n"
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

record_error() {
  local exit_code="$1"
  ERROR_LINE="$2"
  ERROR_COMMAND="$3"
  return "$exit_code"
}

cleanup() {
  local exit_code=$?
  trap - ERR EXIT
  rm -rf "$TMP_ROOT"
  if [[ "$exit_code" != "0" && "$INSTALL_COMPLETED" != "1" \
    && -n "$PREVIOUS_HERMES_BACKUP" && -d "$PREVIOUS_HERMES_BACKUP" ]]; then
    rm -rf "$HERMES_ROOT"
    if mv "$PREVIOUS_HERMES_BACKUP" "$HERMES_ROOT"; then
      printf "Restored previous Hermes after failed install.\n" >> "$LOG_FILE"
    else
      printf "WARNING: could not restore previous Hermes from %s\n" "$PREVIOUS_HERMES_BACKUP" >> "$LOG_FILE"
    fi
  fi
  if [[ "$exit_code" != "0" && "$INSTALL_COMPLETED" != "1" \
    && -n "$PREVIOUS_WEB_SHELL_BACKUP" && -d "$PREVIOUS_WEB_SHELL_BACKUP" ]]; then
    rm -rf "$WEB_SHELL_ROOT"
    if mv "$PREVIOUS_WEB_SHELL_BACKUP" "$WEB_SHELL_ROOT"; then
      printf "Restored previous WebShell after failed install.\n" >> "$LOG_FILE"
    else
      printf "WARNING: could not restore previous WebShell from %s\n" "$PREVIOUS_WEB_SHELL_BACKUP" >> "$LOG_FILE"
    fi
  fi
  if [[ "$exit_code" != "0" && "$INSTALL_COMPLETED" != "1" && "$STUDENT_UI" == "1" ]]; then
    printf "\033[2J\033[H"
    printf "Установка остановилась.\n\n"
    printf "Этап: %s\n" "$CURRENT_STAGE"
    if [[ -n "$FAILURE_MESSAGE" ]]; then
      printf "Причина: %s\n" "$FAILURE_MESSAGE"
    else
      printf "Причина: внутренняя команда завершилась с кодом %s" "$exit_code"
      [[ -n "$ERROR_LINE" ]] && printf " (строка %s)" "$ERROR_LINE"
      printf ".\n"
    fi
    printf "Лог: %s\n" "$LOG_FILE"
  fi
  exit "$exit_code"
}
trap 'record_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
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
  CURRENT_STAGE="$label"
  start="$(date +%s)"
  if [[ "$STUDENT_UI" != "1" ]]; then
    printf "   %s... 0s" "$label"
  else
    render_progress "$label"
  fi
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
    if [[ "$STUDENT_UI" != "1" ]]; then
      printf "\r   %s... %s" "$label" "$(format_seconds "$elapsed")"
    fi
    sleep 1
  done
  set +e
  wait "$pid"
  exit_code=$?
  set -e
  elapsed=$(($(date +%s) - start))
  if [[ "$STUDENT_UI" != "1" ]]; then
    if (( exit_code == 0 )); then
      printf "\r   %s... done in %s\n" "$label" "$(format_seconds "$elapsed")"
    else
      printf "\r   %s... failed after %s\n" "$label" "$(format_seconds "$elapsed")"
    fi
  fi
  return "$exit_code"
}

download_file() {
  local url="$1"
  local output="$2"
  [[ "$STUDENT_UI" != "1" ]] && printf "   Downloading: %s\n" "${url%%\?*}"
  printf "Downloading: %s\n" "${url%%\?*}" >> "$LOG_FILE"
  if [[ "$STUDENT_UI" == "1" ]]; then
    curl -fsSL \
      --connect-timeout "$CURL_CONNECT_TIMEOUT" \
      --max-time "$CURL_MAX_TIME" \
      --retry 2 \
      --retry-delay 2 \
      --retry-all-errors \
      "$url" -o "$output" >> "$LOG_FILE" 2>&1
  else
    curl -fL --progress-bar \
      --connect-timeout "$CURL_CONNECT_TIMEOUT" \
      --max-time "$CURL_MAX_TIME" \
      --retry 2 \
      --retry-delay 2 \
      --retry-all-errors \
      "$url" -o "$output" 2> >(tee -a "$LOG_FILE" >&2)
  fi
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

acquire_install_lock() {
  command -v flock >/dev/null 2>&1 \
    || fail "flock is unavailable; use Ubuntu 22.04/24.04 or Debian 11+"
  exec 9>"$INSTALL_ROOT/.install.lock"
  flock -n 9 \
    || fail "Another Infobiz Agents install or update is already running on this VPS"
}

ensure_tmux_session() {
  [[ "$STUDENT_UI" == "1" ]] || return 0
  [[ "$INFOBIZ_INSIDE_TMUX" != "1" ]] || return 0

  # VNC/serial consoles already own a persistent server terminal. Putting the
  # installer in tmux there can hide the OpenAI device code behind an alternate
  # screen, leaving the visible console frozen on the outer 9% progress frame.
  # SSH installs still use tmux so they survive a dropped network connection.
  if [[ -z "${SSH_CONNECTION:-}" && -z "${SSH_TTY:-}" ]]; then
    printf "Direct VPS console detected; continuing without tmux.\n" >> "$LOG_FILE"
    return 0
  fi

  if ! command -v tmux >/dev/null 2>&1; then
    command -v apt-get >/dev/null 2>&1 || fail "tmux is not installed and apt-get is unavailable"
    printf "Installing tmux for a resumable install session.\n" >> "$LOG_FILE"
    timeout "$TMUX_BOOTSTRAP_TIMEOUT" apt-get update -qq >> "$LOG_FILE" 2>&1 \
      || fail "Could not update packages for tmux"
    timeout "$TMUX_BOOTSTRAP_TIMEOUT" apt-get install -y -qq tmux >> "$LOG_FILE" 2>&1 \
      || fail "Could not install tmux"
  fi

  local stable_script="$INSTALL_ROOT/install-vps-infobiz-agents.sh"
  local stable_tmp="${stable_script}.tmp.$$"
  local source_script="${BASH_SOURCE[0]}"
  local status_file="$INSTALL_ROOT/.${TMUX_SESSION_NAME}.status"
  local session_exists=0
  if tmux has-session -t "$TMUX_SESSION_NAME" >/dev/null 2>&1; then
    session_exists=1
  fi

  if (( session_exists == 0 )); then
    if [[ -r "$source_script" ]]; then
      cp "$source_script" "$stable_tmp" \
        || fail "Could not prepare resumable installer"
    else
      download_file \
        "https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh" \
        "$stable_tmp" || fail "Could not prepare resumable installer"
    fi
    chmod 700 "$stable_tmp"
    mv -f "$stable_tmp" "$stable_script"
    rm -f -- "$status_file"
  fi

  local tmux_command tmux_client_exit_code installer_exit_code waited
  printf -v tmux_command \
    'set +e; INFOBIZ_INSIDE_TMUX=1 STUDENT_UI=%q VERSION=%q BASE_URL=%q PROFILE_URL=%q WEB_SHELL_URL=%q PUBLIC_HOST=%q WEB_SHELL_PUBLIC_URL=%q INSTALL_ROOT=%q HERMES_ROOT=%q TMUX_SESSION_NAME=%q CURL_CONNECT_TIMEOUT=%q CURL_MAX_TIME=%q FORCE_REINSTALL=%q bash %q; install_status=$?; status_file=%q; status_tmp="${status_file}.tmp.$$"; if ! printf "%%s\n" "$install_status" > "$status_tmp" || ! mv -f "$status_tmp" "$status_file"; then printf "\nНе удалось сохранить результат установки.\n"; exit 125; fi; printf "\n"; if [ "$install_status" -eq 0 ]; then printf "Готово. Возвращаюсь в основную консоль...\n"; else printf "Установка завершилась с ошибкой. Причина и путь к логу указаны выше.\n"; fi; exit "$install_status"' \
    "$STUDENT_UI" "$VERSION" "$BASE_URL" "$PROFILE_URL" "$WEB_SHELL_URL" \
    "$PUBLIC_HOST" "$WEB_SHELL_PUBLIC_URL" "$INSTALL_ROOT" "$HERMES_ROOT" \
    "$TMUX_SESSION_NAME" "$CURL_CONNECT_TIMEOUT" "$CURL_MAX_TIME" "$FORCE_REINSTALL" \
    "$stable_script" "$status_file"

  case "${TERM:-}" in
    ""|dumb|unknown) export TERM="xterm-256color" ;;
  esac
  local terminal_path
  terminal_path="$(readlink "/proc/$$/fd/1" 2>/dev/null || true)"
  if [[ "$terminal_path" != /dev/pts/* && "$terminal_path" != /dev/tty* ]]; then
    printf "No controlling terminal; continuing without tmux.\n" >> "$LOG_FILE"
    return 0
  fi

  set +e
  tmux new-session -A -s "$TMUX_SESSION_NAME" "$tmux_command" <"$terminal_path"
  tmux_client_exit_code=$?
  set -e

  waited=0
  while [[ ! -f "$status_file" ]] \
    && tmux has-session -t "$TMUX_SESSION_NAME" >/dev/null 2>&1 \
    && (( waited < TMUX_STATUS_WAIT_SECONDS )); do
    sleep 1
    waited=$((waited + 1))
  done

  installer_exit_code=""
  if [[ -f "$status_file" ]]; then
    installer_exit_code="$(head -n 1 "$status_file" 2>/dev/null || true)"
  fi
  if [[ ! "$installer_exit_code" =~ ^[0-9]{1,3}$ ]] \
    || (( 10#$installer_exit_code > 255 )); then
    installer_exit_code="$tmux_client_exit_code"
    (( installer_exit_code != 0 )) || installer_exit_code=1
  else
    installer_exit_code=$((10#$installer_exit_code))
  fi

  printf "\033[2J\033[H"
  if (( installer_exit_code == 0 )); then
    printf "Установка завершена.\n"
    if [[ -f "$INSTALL_ROOT/web-shell.url" ]]; then
      printf "\nПанель агентов:\n%s\n" "$(head -n 1 "$INSTALL_ROOT/web-shell.url")"
    fi
  else
    printf "Установка завершилась с ошибкой.\n"
    printf "Лог: %s\n" "$LOG_FILE"
  fi
  INSTALL_COMPLETED=1
  exit "$installer_exit_code"
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || fail "VPS installer supports Linux only"
  if [[ -r /etc/os-release ]]; then
    local os_id os_pretty
    os_id="$(. /etc/os-release; printf "%s" "${ID:-}")"
    os_pretty="$(. /etc/os-release; printf "%s" "${PRETTY_NAME:-unknown}")"
    case "$os_id" in
      ubuntu|debian) ;;
      *) printf "WARNING: tested on Ubuntu/Debian, current OS: %s\n" "$os_pretty" ;;
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
  printf "%s\n" "$UV_CMD" > "$UV_INSTALLED_MARKER"
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
  tarball_name="$(curl -fsSL --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time 30 \
    "$index_url" | grep -oE "node-v${NODE_VERSION}\.[0-9]+\.[0-9]+-linux-${node_arch}\.tar\.xz" | head -1 || true)"
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
  : > "$NODE_INSTALLED_MARKER"
  export PATH="$HERMES_ROOT/node/bin:$PATH"
}

patch_official_hermes_setup() {
  local setup_path="$HERMES_AGENT_ROOT/setup-hermes.sh"
  local tmp_path="$setup_path.infobiz"
  [[ -f "$setup_path" ]] || return 1
  awk '
    {
      if (index($0, "read -p") && index($0, "Install ripgrep for faster search")) {
        sub(/read -p.*/, "REPLY=n");
      }
      if (index($0, "read -p") && index($0, "Would you like to run the setup wizard now")) {
        sub(/read -p.*/, "REPLY=n");
      }
      print;
    }
  ' "$setup_path" > "$tmp_path" || return 1
  mv "$tmp_path" "$setup_path" || return 1
  chmod +x "$setup_path" || return 1
}

ensure_hermes_messaging_support() {
  local python_bin="$HERMES_AGENT_ROOT/venv/bin/python"
  [[ -x "$python_bin" ]] || return 1

  if "$python_bin" -c "import telegram, aiohttp, qrcode" >> "$LOG_FILE" 2>&1; then
    return 0
  fi
  [[ -n "$UV_CMD" && -x "$UV_CMD" ]] || return 1

  printf "Official Hermes messaging extra is missing; installing it now.\n" >> "$LOG_FILE"
  if ! (
    cd "$HERMES_AGENT_ROOT" && \
      UV_PROJECT_ENVIRONMENT="$HERMES_AGENT_ROOT/venv" \
      "$UV_CMD" sync --extra all --extra messaging --locked
  ) >> "$LOG_FILE" 2>&1; then
    printf "Locked messaging sync failed; falling back to the official messaging extra.\n" >> "$LOG_FILE"
    (
      cd "$HERMES_AGENT_ROOT" && \
        "$UV_CMD" pip install --python "$python_bin" -e ".[messaging]"
    ) >> "$LOG_FILE" 2>&1 || return 1
  fi

  "$python_bin" -c "import telegram, aiohttp, qrcode" >> "$LOG_FILE" 2>&1
}

resolve_hermes_source() {
  if [[ -n "$HERMES_SOURCE_URL" ]]; then
    HERMES_SOURCE_REF="custom"
    return 0
  fi
  if [[ -n "$HERMES_BRANCH" ]]; then
    HERMES_SOURCE_URL="https://github.com/NousResearch/hermes-agent/archive/refs/heads/$HERMES_BRANCH.tar.gz"
    HERMES_SOURCE_REF="branch:$HERMES_BRANCH"
    return 0
  fi

  local metadata tag tarball
  metadata="$(curl -fsSL --max-time 20 "$HERMES_RELEASE_API" 2>> "$LOG_FILE" || true)"
  tag="$(printf "%s" "$metadata" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -1)"
  tarball="$(printf "%s" "$metadata" | sed -nE 's/.*"tarball_url"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -1)"
  if [[ -n "$tarball" ]]; then
    HERMES_SOURCE_URL="$tarball"
    HERMES_SOURCE_REF="release:${tag:-latest}"
  else
    HERMES_SOURCE_URL="https://github.com/NousResearch/hermes-agent/archive/refs/tags/$HERMES_FALLBACK_TAG.tar.gz"
    HERMES_SOURCE_REF="fallback:$HERMES_FALLBACK_TAG"
  fi
}

patch_hermes_image_reference_support() {
  local patcher="$TMP_ROOT/patch-hermes-image-reference.py"
  download_file "$HERMES_IMAGE_REFERENCE_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_telegram_text_photo_merge_support() {
  local patcher="$TMP_ROOT/patch-telegram-text-photo-merge.py"
  download_file "$HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_hermes_local_media_markdown_support() {
  local patcher="$TMP_ROOT/patch-hermes-local-media-markdown.py"
  download_file "$HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_hermes_codex_runtime_safety() {
  local patcher="$TMP_ROOT/patch-hermes-codex-runtime-safety.py"
  download_file "$HERMES_RUNTIME_SAFETY_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --hermes-agent-root "$HERMES_AGENT_ROOT" \
    --profiles "$AGENT_PROFILES"
}

patch_hermes_telegram_reliability() {
  local patcher="$TMP_ROOT/patch-hermes-telegram-reliability.py"
  download_file "$HERMES_TELEGRAM_RELIABILITY_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

repair_hermes_session_history() {
  local patcher="$TMP_ROOT/repair-hermes-session-history.py"
  download_file "$HERMES_SESSION_HISTORY_REPAIR_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "default,$AGENT_PROFILES" \
    --apply
}

patch_agents_russian_only() {
  local patcher="$TMP_ROOT/patch-agent-russian-only.py"
  download_file "$AGENT_RUSSIAN_ONLY_PATCH_URL" "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "$AGENT_PROFILES"
}

install_hermes_from_source() {
  local source_tarball="$TMP_ROOT/hermes-agent-source.tar.gz"
  resolve_hermes_source
  printf "Resolved official Hermes source: %s (%s)\n" "$HERMES_SOURCE_URL" "$HERMES_SOURCE_REF" >> "$LOG_FILE"
  download_file "$HERMES_SOURCE_URL" "$source_tarball"
  rm -rf "$HERMES_AGENT_ROOT"
  mkdir -p "$HERMES_AGENT_ROOT"
  run_logged "Extracting Hermes source" tar --strip-components=1 -xzf "$source_tarball" -C "$HERMES_AGENT_ROOT"
  patch_official_hermes_setup
  run_logged "Running official Hermes setup" run_official_hermes_setup
  [[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || fail "Official Hermes setup did not create Python venv"
  [[ -x "$HERMES_CMD" ]] || fail "Official Hermes setup did not create Hermes command"
  run_logged "Installing official Hermes messaging support" ensure_hermes_messaging_support
  printf "managed-runtime\n" > "$HERMES_AGENT_ROOT/.install_method"
  printf "%s\n" "$HERMES_SOURCE_REF" > "$HERMES_AGENT_ROOT/.infobiz-upstream-ref"
  mkdir -p "$HOME/.local/bin" "$HERMES_ROOT"/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,skills}
  ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"
  [[ -f "$HERMES_ROOT/.env" ]] || cp "$HERMES_AGENT_ROOT/.env" "$HERMES_ROOT/.env" 2>/dev/null || cp "$HERMES_AGENT_ROOT/.env.example" "$HERMES_ROOT/.env" 2>/dev/null || : > "$HERMES_ROOT/.env"
  [[ -f "$HERMES_ROOT/config.yaml" ]] || cp "$HERMES_AGENT_ROOT/cli-config.yaml.example" "$HERMES_ROOT/config.yaml" 2>/dev/null || true
  if [[ -f "$HERMES_AGENT_ROOT/tools/skills_sync.py" ]]; then
    HERMES_HOME="$HERMES_ROOT" "$HERMES_AGENT_ROOT/venv/bin/python" "$HERMES_AGENT_ROOT/tools/skills_sync.py" >> "$LOG_FILE" 2>&1 || true
  fi
}

run_official_hermes_setup() {
  (
    cd "$HERMES_AGENT_ROOT"
    HERMES_HOME="$HERMES_ROOT" bash ./setup-hermes.sh
  )
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
GATEWAY_ALLOW_ALL_USERS='false'
GROQ_API_KEY=''
STT_GROQ_MODEL='whisper-large-v3-turbo'
INFOBIZ_VOICE_ENGINE='local'
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.4-mini'
HERMES_HOME='$profile_root'
WEB_SHELL_API_URL='http://127.0.0.1:$WEB_SHELL_PORT'
PATH='$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
ENV
  if [[ "$profile" != "default" ]]; then
    printf "HERMES_KANBAN_DISPATCH_IN_GATEWAY='false'\n" >> "$profile_root/.env"
  fi
  chmod 600 "$profile_root/.env"
}

apply_best_available_model() {
  say "Selecting best available OpenAI model"
  HERMES_HOME="$HERMES_ROOT" \
  HERMES_ROOT="$HERMES_ROOT" \
  HERMES_AGENT_ROOT="$HERMES_AGENT_ROOT" \
  AGENT_PROFILES="$AGENT_PROFILES" \
  HERMES_MODEL_CANDIDATES="${HERMES_MODEL_CANDIDATES:-}" \
  "$HERMES_AGENT_ROOT/venv/bin/python" <<'PY' >> "$LOG_FILE" 2>&1
import os
import re
import subprocess
import uuid
from pathlib import Path

try:
    import yaml
except Exception as exc:
    raise SystemExit(f"PyYAML is required to configure the selected model: {exc}")

home = Path(os.environ["HERMES_ROOT"]).expanduser()
agent_root = Path(os.environ["HERMES_AGENT_ROOT"]).expanduser()
python = agent_root / "venv" / "bin" / "python"
profiles = ["default"] + [p.strip() for p in os.environ.get("AGENT_PROFILES", "").split(",") if p.strip()]
candidates = [m.strip() for m in os.environ.get("HERMES_MODEL_CANDIDATES", "").split(",") if m.strip()]
if not candidates:
    try:
        from agent.auxiliary_client import _read_codex_access_token
        from hermes_cli.codex_models import get_codex_model_ids
        candidates = get_codex_model_ids(_read_codex_access_token())
    except Exception as exc:
        print(f"official Codex model discovery failed: {exc}")
        candidates = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"]
prompt = "Return exactly MODEL_OK and nothing else."

def profile_dir(profile):
    return home if profile == "default" else home / "profiles" / profile

def env_quote(value):
    return "'" + value.replace("'", "'\\''") + "'"

def atomic_write(path, text, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.chmod(mode)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()

def write_env_value(path, key, value):
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    line = f"{key}={env_quote(value)}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    text = pattern.sub(line, text) if pattern.search(text) else text.rstrip() + "\n" + line + "\n"
    atomic_write(path, text)

def write_config_model(path, model):
    data = yaml.safe_load(path.read_text(encoding="utf-8", errors="ignore") if path.exists() else "") or {}
    if not isinstance(data, dict):
        data = {}
    model_cfg = data.setdefault("model", {})
    if not isinstance(model_cfg, dict):
        model_cfg = {}
        data["model"] = model_cfg
    model_cfg["provider"] = "openai-codex"
    model_cfg["default"] = model
    model_cfg["base_url"] = ""
    model_cfg.pop("context_length", None)
    model_cfg["openai_runtime"] = "auto"
    model_cfg.pop("api_mode", None)
    auxiliary = data.setdefault("auxiliary", {})
    if not isinstance(auxiliary, dict):
        auxiliary = {}
        data["auxiliary"] = auxiliary
    title_generation = auxiliary.setdefault("title_generation", {})
    if not isinstance(title_generation, dict):
        title_generation = {}
        auxiliary["title_generation"] = title_generation
    title_generation["enabled"] = False
    atomic_write(path, yaml.safe_dump(data, allow_unicode=True, sort_keys=False))

def model_works(model):
    env = os.environ.copy()
    env["HERMES_HOME"] = str(home)
    env["HERMES_INFERENCE_PROVIDER"] = "openai-codex"
    env["HERMES_INFERENCE_MODEL"] = model
    try:
        result = subprocess.run(
            [str(python), "-m", "hermes_cli.main", "-z", prompt, "--provider", "openai-codex", "--model", model, "--ignore-rules"],
            cwd=str(agent_root),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=75,
        )
    except subprocess.TimeoutExpired:
        print(f"model probe timeout: {model}")
        return False
    output = (result.stdout or "").strip()
    print(f"model probe {model}: exit={result.returncode}, output={output[:240]!r}")
    return result.returncode == 0 and "MODEL_OK" in output

selected = None
for model in candidates:
    if model_works(model):
        selected = model
        break

if not selected:
    raise SystemExit("No available OpenAI Codex model passed the runtime probe")
print(f"Selected OpenAI Codex model: {selected}")

for profile in profiles:
    root = profile_dir(profile)
    if not root.exists():
        continue
    write_config_model(root / "config.yaml", selected)
    write_env_value(root / ".env", "HERMES_INFERENCE_PROVIDER", "openai-codex")
    write_env_value(root / ".env", "HERMES_INFERENCE_MODEL", selected)
    write_env_value(root / ".env", "INFOBIZ_MODEL_AUTO_SELECTED", selected)

print(f"INFOBIZ_SELECTED_MODEL={selected}")
PY
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

disable_profile_kanban_dispatch() {
  local config_path="$1/config.yaml"
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$config_path" <<'PY'
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
}

configure_designer_image_generation() {
  local config_path="$1/config.yaml"
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$config_path" <<'PY'
from pathlib import Path
import sys

try:
    import yaml
except Exception as exc:
    raise SystemExit(f"PyYAML is required to configure designer image generation: {exc}")

path = Path(sys.argv[1])
data = yaml.safe_load(path.read_text() if path.exists() else "") or {}
if not isinstance(data, dict):
    data = {}

platform_toolsets = data.setdefault("platform_toolsets", {})
if not isinstance(platform_toolsets, dict):
    platform_toolsets = {}
    data["platform_toolsets"] = platform_toolsets

for platform in ("cli", "telegram", "web"):
    current = platform_toolsets.get(platform)
    if not isinstance(current, list):
        current = []
    if "image_gen" not in current:
        current.append("image_gen")
    platform_toolsets[platform] = current

image_gen = data.setdefault("image_gen", {})
if not isinstance(image_gen, dict):
    image_gen = {}
    data["image_gen"] = image_gen
image_gen["provider"] = "openai-codex"
image_gen["model"] = "gpt-image-2-high"
openai_codex = image_gen.setdefault("openai-codex", {})
if not isinstance(openai_codex, dict):
    openai_codex = {}
    image_gen["openai-codex"] = openai_codex
openai_codex["model"] = "gpt-image-2-high"

path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
PY
}

validate_profile_payload() {
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$1" "$VERSION" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
expected_version = sys.argv[2]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
required = {"default", "marketer", "copywriter", "designer", "tech"}
if str(manifest.get("version")) != expected_version:
    raise SystemExit(f"payload version mismatch: {manifest.get('version')} != {expected_version}")
if not required.issubset(set(manifest.get("profiles") or [])):
    raise SystemExit("payload profile manifest is incomplete")
if manifest.get("hermesRequires") != ">=0.18.2":
    raise SystemExit("payload Hermes compatibility marker is missing")
PY
}

install_profiles_and_skills() {
  local payload="$TMP_ROOT/profile.tar.gz"
  local workdir="$TMP_ROOT/profile"
  local profile source_dir skill_count
  download_file "$PROFILE_URL" "$payload"
  mkdir -p "$workdir"
  run_logged "Extracting agent profiles" tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/profile/agents" || -d "$workdir/profile/skills" ]] || fail "Profile payload is invalid"
  validate_profile_payload "$workdir/profile" || fail "Profile payload manifest is invalid"

  mkdir -p "$HERMES_ROOT/profiles"
  IFS=',' read -r -a profiles <<< "$AGENT_PROFILES"
  for profile in "${profiles[@]}"; do
    profile="$(echo "$profile" | xargs)"
    [[ -n "$profile" ]] || continue
    say "Creating profile: $profile"
    create_clean_profile "$profile"
    source_dir="$workdir/profile/agents/$profile"
    if [[ -d "$source_dir" ]]; then
      rsync -a \
        --exclude '.env' \
        --exclude 'config.yaml' \
        --exclude 'sessions/' \
        --exclude 'logs/' \
        --exclude 'memories/' \
        --exclude 'test-runs/' \
        "$source_dir/" "$HERMES_ROOT/profiles/$profile/"
    elif [[ -d "$workdir/profile/skills" ]]; then
      mkdir -p "$HERMES_ROOT/profiles/$profile/skills"
      rsync -a "$workdir/profile/skills/" "$HERMES_ROOT/profiles/$profile/skills/"
    else
      fail "No source files found for profile: $profile"
    fi
    skill_count="$(find "$HERMES_ROOT/profiles/$profile/skills" -name 'SKILL.md' -type f | wc -l | tr -d ' ')"
    [[ "$skill_count" != "0" ]] || fail "No skills were installed for profile: $profile"
    printf "Installed %s skills for %s\n" "$skill_count" "$profile" >> "$LOG_FILE"
    write_profile_env "$profile"
    enable_telegram_platform "$HERMES_ROOT/profiles/$profile"
    disable_profile_kanban_dispatch "$HERMES_ROOT/profiles/$profile"
    if [[ "$profile" == "designer" ]]; then
      configure_designer_image_generation "$HERMES_ROOT/profiles/$profile"
    fi
  done

  if [[ -d "$workdir/profile/skills/webshell-docs" ]]; then
    rm -rf "$HERMES_ROOT/skills/webshell-docs"
    rsync -a "$workdir/profile/skills/webshell-docs" "$HERMES_ROOT/skills/"
  fi
  if [[ -d "$workdir/profile/default" ]]; then
    rsync -a \
      --exclude '.env' \
      --exclude 'config.yaml' \
      --exclude 'sessions/' \
      --exclude 'logs/' \
      --exclude 'memories/' \
      --exclude 'profiles/' \
      --exclude 'hermes-agent/' \
      --exclude 'node/' \
      "$workdir/profile/default/" "$HERMES_ROOT/"
  fi
  write_profile_env "default"
  enable_telegram_platform "$HERMES_ROOT"
}

install_web_shell() {
  local payload="$TMP_ROOT/web-shell.tar.gz"
  local workdir="$TMP_ROOT/web-shell"
  local item
  download_file "$WEB_SHELL_URL" "$payload" || return 1
  mkdir -p "$workdir" || return 1
  run_logged "Extracting WebShell" tar -xzf "$payload" -C "$workdir" || return 1
  [[ -d "$workdir/web-shell" ]] || fail "WebShell payload is invalid"
  mkdir -p "$INSTALL_ROOT" || return 1
  if [[ -d "$WEB_SHELL_ROOT" ]]; then
    PREVIOUS_WEB_SHELL_BACKUP="$INSTALL_ROOT/.web-shell.backup.$(date +%Y%m%d%H%M%S).$$"
    mv "$WEB_SHELL_ROOT" "$PREVIOUS_WEB_SHELL_BACKUP" \
      || { PREVIOUS_WEB_SHELL_BACKUP=""; return 1; }
  fi
  if ! cp -a "$workdir/web-shell" "$WEB_SHELL_ROOT"; then
    rm -rf "$WEB_SHELL_ROOT"
    if [[ -n "$PREVIOUS_WEB_SHELL_BACKUP" && -d "$PREVIOUS_WEB_SHELL_BACKUP" ]]; then
      mv "$PREVIOUS_WEB_SHELL_BACKUP" "$WEB_SHELL_ROOT" || true
      PREVIOUS_WEB_SHELL_BACKUP=""
    fi
    return 1
  fi
  if [[ -n "$PREVIOUS_WEB_SHELL_BACKUP" && -d "$PREVIOUS_WEB_SHELL_BACKUP" ]]; then
    for item in docs.json groups.json agent-overrides.json baseline.json runs approvals snapshots preflights uploads; do
      [[ -e "$PREVIOUS_WEB_SHELL_BACKUP/$item" ]] || continue
      rm -rf "$WEB_SHELL_ROOT/$item" || return 1
      cp -a "$PREVIOUS_WEB_SHELL_BACKUP/$item" "$WEB_SHELL_ROOT/" || return 1
    done
  fi
  [[ -f "$WEB_SHELL_ROOT/server.mjs" && -f "$WEB_SHELL_ROOT/public/index.html" ]] || return 1
  mkdir -p "$INSTALL_ROOT/workspace" "$INSTALL_ROOT/obsidian-vault" "$HOME/.hermes-workspaces" || return 1
}

install_systemd_services() {
  local node_cmd="$HERMES_ROOT/node/bin/node"
  [[ -x "$node_cmd" ]] || node_cmd="$(command -v node)"
  [[ -n "$WEB_SHELL_ACCESS_TOKEN" ]] || WEB_SHELL_ACCESS_TOKEN="$(openssl rand -hex 24)"
  cat > "$INSTALL_ROOT/vps.env" <<ENV
WEB_SHELL_ACCESS_TOKEN='$WEB_SHELL_ACCESS_TOKEN'
WEB_SHELL_PORT='$WEB_SHELL_PORT'
AGENT_PROFILE_ALLOW='$AGENT_PROFILE_ALLOW'
ENV
  chmod 600 "$INSTALL_ROOT/vps.env"
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
EnvironmentFile=$INSTALL_ROOT/vps.env
Environment=PATH=$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable --now infobiz-web-shell.service
}

install_gateway_systemd_services() {
  local profile service profile_home
  if [[ "$AGENT_PROFILE_ALLOW" != *"producer"* ]]; then
    systemctl disable --now infobiz-hermes-gateway-producer.service >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/infobiz-hermes-gateway-producer.service
  fi
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
    systemctl daemon-reload
    systemctl enable --now "$service" || fail "Could not start gateway service: $service"
  done
}

open_firewall_if_available() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "$WEB_SHELL_PORT/tcp" >/dev/null 2>&1 || true
  fi
}

run_openai_auth() {
  if [[ "$STUDENT_UI" != "1" ]]; then
    say "OpenAI/Hermes authorization"
    printf "Follow the device-code instructions below. Open the URL on your computer or phone.\n"
    run_hermes auth add openai-codex
    return
  fi

  printf "\033[2J\033[H"
  HERMES_HOME="$HERMES_ROOT" \
  PATH="$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$PATH" \
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$LOG_FILE" "$HERMES_CMD" auth add openai-codex <<'PY'
import os
import pty
import re
import select
import sys

log_path = sys.argv[1]
argv = sys.argv[2:]
url_re = re.compile(r"https?://[^\s)>\]\"']+")
ansi_re = re.compile(r"\x1b\[[0-9;]*m")
code_re = re.compile(r"\b[A-Z0-9][A-Z0-9 -]{3,30}[A-Z0-9]\b")
shown_urls = set()
shown_codes = set()
buffer = ""


def show(message):
    os.write(sys.stdout.fileno(), f"{message}\n".encode())


def show_url(url):
    if url in shown_urls:
        return
    shown_urls.add(url)
    show(f"Авторизуйтесь в OpenAI:\n{url}")


def show_code(code, context):
    if code in shown_codes or "code" not in context.lower():
        return
    shown_codes.add(code)
    show(f"Код: {code}\nОжидаю авторизацию...")


def inspect_output(text):
    global buffer
    buffer = (buffer + text)[-4000:]
    plain_text = ansi_re.sub("", text)
    plain_buffer = ansi_re.sub("", buffer).replace("\r", "\n")
    for match in url_re.findall(plain_text):
        show_url(match.rstrip(".,;:"))
    lower = plain_buffer.lower()
    marker = lower.rfind("enter this code")
    if marker < 0:
        marker = lower.rfind("authorization code")
    if marker >= 0:
        context = plain_buffer[marker:marker + 500]
        for raw in code_re.findall(context):
            code = re.sub(r"\s+", "-", raw.strip())
            if len(code.replace("-", "")) >= 4:
                show_code(code, "code: " + context)


pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)

exit_status = 1
child_done = False
try:
    while True:
        readable, _, _ = select.select([fd], [], [], 0.2)
        if fd in readable:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            text = data.decode(errors="ignore")
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(text)
            inspect_output(text)
        finished_pid, status = os.waitpid(pid, os.WNOHANG)
        if finished_pid:
            exit_status = os.waitstatus_to_exitcode(status)
            child_done = True
            break
finally:
    try:
        os.close(fd)
    except OSError:
        pass
    if not child_done:
        try:
            _, status = os.waitpid(pid, 0)
            exit_status = os.waitstatus_to_exitcode(status)
        except ChildProcessError:
            pass

sys.exit(exit_status)
PY
}

is_infobiz_managed_install() {
  [[ -d "$HERMES_AGENT_ROOT" ]] || return 1
  local profile profile_count=0
  for profile in marketer copywriter designer tech; do
    [[ -d "$HERMES_ROOT/profiles/$profile" ]] && profile_count=$((profile_count + 1))
  done
  [[ "$profile_count" -eq 4 ]] || return 1
  [[ -f "$WEB_SHELL_ROOT/server.mjs" ]] || return 1
  [[ -s "$INSTALL_ROOT/web-shell.url" ]] || return 1
  [[ -s "$INSTALL_ROOT/vps.env" ]] || return 1

  # New installs write this marker only after every service and the public URL
  # are ready. The file checks above keep already-completed older installs
  # upgradeable without mistaking an interrupted profile extraction for one.
  if [[ -f "$INSTALL_COMPLETE_MARKER" ]]; then
    return 0
  fi

  # Compatibility for installations completed before the marker existed.
  local service
  for service in \
    infobiz-web-shell.service \
    infobiz-hermes-gateway.service \
    infobiz-hermes-gateway-marketer.service \
    infobiz-hermes-gateway-copywriter.service \
    infobiz-hermes-gateway-designer.service \
    infobiz-hermes-gateway-tech.service
  do
    [[ -f "/etc/systemd/system/$service" ]] || return 1
  done
  return 0
}

has_infobiz_managed_footprint() {
  [[ -f "$HERMES_AGENT_ROOT/.infobiz-upstream-ref" ]] && return 0
  [[ "$(cat "$HERMES_AGENT_ROOT/.install_method" 2>/dev/null || true)" == "managed-runtime" ]] && return 0
  [[ -d "$WEB_SHELL_ROOT" ]] && return 0
  local profile
  for profile in marketer copywriter designer tech; do
    [[ -d "$HERMES_ROOT/profiles/$profile" ]] && return 0
  done
  return 1
}

main() {
  mkdir -p "$INSTALL_ROOT" "$TMP_ROOT"
  touch "$LOG_FILE"
  [[ "$STUDENT_UI" == "1" ]] && progress_stage "Подготовка терминала"
  require_linux
  ensure_tmux_session
  acquire_install_lock
  printf "\nInfobiz Agents VPS install log\nStarted: %s\n" "$(date)" >> "$LOG_FILE"

  if [[ "$FORCE_REINSTALL" != "1" ]] && is_infobiz_managed_install; then
    say "Existing Infobiz installation found; running safe update"
    local update_script="$TMP_ROOT/update-vps-infobiz-agents.sh"
    download_file "$UPDATE_SCRIPT_URL" "$update_script" || fail "Could not download safe updater"
    chmod 700 "$update_script"
    progress_stage "Обновление существующей установки"
    STUDENT_UI="$STUDENT_UI" VERSION="$VERSION" BASE_URL="$BASE_URL" \
      UPDATE_PROGRESS_START="$((PROGRESS_STEP * 100 / PROGRESS_TOTAL))" \
      UPDATE_PROGRESS_END=99 \
      CURL_CONNECT_TIMEOUT="$CURL_CONNECT_TIMEOUT" CURL_MAX_TIME="$CURL_MAX_TIME" \
      PROFILE_URL="$PROFILE_URL" WEB_SHELL_URL="$WEB_SHELL_URL" \
      INFOBIZ_INSTALL_LOCK_HELD=1 \
      bash "$update_script"
    : > "$INSTALL_COMPLETE_MARKER"
    INSTALL_COMPLETED=1
    PROGRESS_STEP="$PROGRESS_TOTAL"
    render_progress "Готово"
    if [[ -f "$INSTALL_ROOT/web-shell.url" ]]; then
      printf "\nПанель агентов:\n%s\n" "$(head -n 1 "$INSTALL_ROOT/web-shell.url")"
    fi
    return 0
  fi

  if [[ -d "$HERMES_ROOT" ]]; then
    local existing_was_infobiz=0
    has_infobiz_managed_footprint && existing_was_infobiz=1
    local hermes_backup="$HOME/.hermes.backup.$(date +%Y%m%d%H%M%S)"
    mv "$HERMES_ROOT" "$hermes_backup"
    PREVIOUS_HERMES_BACKUP="$hermes_backup"
    if [[ "$existing_was_infobiz" != "1" ]]; then
      : > "$hermes_backup/.infobiz-restore-eligible"
    fi
    printf "Existing Hermes moved to %s\n" "$hermes_backup" >> "$LOG_FILE"
  fi
  mkdir -p "$HERMES_ROOT"

  say "Installing Infobiz Agents VPS stack"
  progress_stage "Подготовка сервера"
  install_system_packages
  progress_stage "Установка менеджера Python"
  ensure_uv
  progress_stage "Установка Node.js"
  install_node_runtime
  progress_stage "Установка Hermes официальным установщиком"
  install_hermes_from_source
  patch_hermes_image_reference_support >> "$LOG_FILE" 2>&1 || fail "Could not patch Hermes image reference support"
  patch_telegram_text_photo_merge_support >> "$LOG_FILE" 2>&1 || fail "Could not patch Telegram text/photo merge support"
  patch_hermes_local_media_markdown_support >> "$LOG_FILE" 2>&1 || fail "Could not patch local media delivery"
  progress_stage "Создание агентов и установка скиллов"
  install_profiles_and_skills
  patch_agents_russian_only >> "$LOG_FILE" 2>&1 || fail "Could not patch Russian-only agent language"
  run_openai_auth || fail "OpenAI authorization failed"
  [[ "$STUDENT_UI" == "1" ]] && render_progress ""
  apply_best_available_model
  patch_hermes_codex_runtime_safety >> "$LOG_FILE" 2>&1 || fail "Could not patch Hermes Codex runtime safety"
  patch_hermes_telegram_reliability >> "$LOG_FILE" 2>&1 || fail "Could not patch Telegram delivery reliability"
  repair_hermes_session_history >> "$LOG_FILE" 2>&1 || fail "Could not repair incomplete session history"
  progress_stage "Установка WebShell"
  install_web_shell
  progress_stage "Запуск панели агентов"
  install_systemd_services
  progress_stage "Запуск gateway-сервисов"
  install_gateway_systemd_services
  progress_stage "Открытие доступа"
  open_firewall_if_available

  if [[ -n "$WEB_SHELL_PUBLIC_URL" ]]; then
    public_url="${WEB_SHELL_PUBLIC_URL%/}"
    if [[ "$public_url" != *"token="* ]]; then
      [[ "$public_url" == *\?* ]] && public_url="$public_url&token=$WEB_SHELL_ACCESS_TOKEN" \
        || public_url="$public_url?token=$WEB_SHELL_ACCESS_TOKEN"
    fi
  else
    public_host="$(detect_public_host)"
    [[ -n "$public_host" ]] || fail "Could not detect the public VPS address; set PUBLIC_HOST explicitly"
    public_url="http://$public_host:$WEB_SHELL_PORT/?token=$WEB_SHELL_ACCESS_TOKEN"
  fi
  printf "%s\n" "$public_url" > "$INSTALL_ROOT/web-shell.url"
  if [[ -n "$PREVIOUS_WEB_SHELL_BACKUP" ]]; then
    rm -rf "$PREVIOUS_WEB_SHELL_BACKUP"
    PREVIOUS_WEB_SHELL_BACKUP=""
  fi
  : > "$INSTALL_COMPLETE_MARKER"
  INSTALL_COMPLETED=1

  if [[ "$STUDENT_UI" == "1" ]]; then
    PROGRESS_STEP="$PROGRESS_TOTAL"
    render_progress "Готово"
    printf "\nПанель агентов:\n%s\n" "$public_url"
  else
    say "Done"
    printf "Панель агентов:\n%s\n\n" "$public_url"
    printf "Локальный API для агентов:\nhttp://127.0.0.1:%s\n\n" "$WEB_SHELL_PORT"
    printf "Лог установки:\n%s\n" "$LOG_FILE"
  fi
}

if [[ "${INFOBIZ_INSTALLER_LIBRARY_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
