#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.cargo/bin"

AGENT_PROFILE="${AGENT_PROFILE:-marketer}"
AGENT_NAME="${AGENT_NAME:-Маркетолог}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-}"
PROFILE_URL="${PROFILE_URL:-}"
PROFILE_TARBALL="${PROFILE_TARBALL:-}"
HERMES_BRANCH="${HERMES_BRANCH:-main}"
HERMES_SOURCE_URL="${HERMES_SOURCE_URL:-https://github.com/NousResearch/hermes-agent/archive/refs/heads/$HERMES_BRANCH.tar.gz}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
HERMES_EXTRAS="${HERMES_EXTRAS:-cli,mcp}"
TELEGRAM_PACKAGES=(
  "python-telegram-bot[webhooks]==22.6"
  "aiohttp==3.13.3"
  "qrcode==7.4.2"
)
NODE_VERSION="${NODE_VERSION:-22}"
ARCH="$(/usr/bin/uname -m)"

INSTALL_ROOT="$HOME/InfobizAgents"
CONFIG_DIR="$HOME/.infobiz-agents"
HERMES_ROOT="$HOME/.hermes"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
PROFILE_ROOT="$HERMES_ROOT/profiles/$AGENT_PROFILE"
LOG_FILE="$INSTALL_ROOT/install.log"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
UV_CMD=""
SHIM_DIR="$INSTALL_ROOT/shims"

say() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

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
  local start now elapsed exit_code
  start="$(/bin/date +%s)"
  printf "   %s... 0s" "$label"
  {
    printf "\n\n[%s] %s\n" "$(/bin/date '+%Y-%m-%d %H:%M:%S')" "$label"
    printf "Command:"
    printf " %q" "$@"
    printf "\n"
  } >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1 &
  local pid="$!"
  while kill -0 "$pid" >/dev/null 2>&1; do
    now="$(/bin/date +%s)"
    elapsed=$((now - start))
    printf "\r   %s... %s" "$label" "$(format_seconds "$elapsed")"
    sleep 1
  done
  set +e
  wait "$pid"
  exit_code=$?
  set -e
  now="$(/bin/date +%s)"
  elapsed=$((now - start))
  if (( exit_code == 0 )); then
    printf "\r   %s... done in %s\n" "$label" "$(format_seconds "$elapsed")"
  else
    printf "\r   %s... failed after %s\n" "$label" "$(format_seconds "$elapsed")"
  fi
  return "$exit_code"
}

shell_quote() {
  printf "%s" "$1" | /usr/bin/sed "s/'/'\\\\''/g; 1s/^/'/; \$s/\$/'/"
}

download_file() {
  local url="$1"
  local output="$2"
  printf "   Downloading: %s\n" "$url" >&2
  printf "Downloading: %s\n" "$url" >> "$LOG_FILE"
  curl -fL --progress-bar "$url" -o "$output" 2> >(/usr/bin/tee -a "$LOG_FILE" >&2)
}

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    UV_CMD="$(command -v uv)"
    return 0
  fi
  if [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_CMD="$HOME/.local/bin/uv"
    return 0
  fi
  if [[ -x "$HOME/.cargo/bin/uv" ]]; then
    UV_CMD="$HOME/.cargo/bin/uv"
    return 0
  fi
  local uv_installer="$TMPDIR/uv-install.sh"
  download_file "https://astral.sh/uv/install.sh" "$uv_installer"
  chmod +x "$uv_installer"
  run_logged "Installing uv package manager" /bin/sh "$uv_installer" || return 1
  if [[ -x "$HOME/.local/bin/uv" ]]; then
    UV_CMD="$HOME/.local/bin/uv"
  elif [[ -x "$HOME/.cargo/bin/uv" ]]; then
    UV_CMD="$HOME/.cargo/bin/uv"
  elif command -v uv >/dev/null 2>&1; then
    UV_CMD="$(command -v uv)"
  else
    return 1
  fi
}

install_node_runtime() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  if [[ -x "$HERMES_ROOT/node/bin/node" ]]; then
    export PATH="$HERMES_ROOT/node/bin:$PATH"
    return 0
  fi

  local node_arch node_os index_url tarball_name download_url tmp_dir extracted_dir
  case "$ARCH" in
    x86_64) node_arch="x64" ;;
    arm64|aarch64) node_arch="arm64" ;;
    *) return 0 ;;
  esac
  node_os="darwin"
  index_url="https://nodejs.org/dist/latest-v${NODE_VERSION}.x/"
  tarball_name="$(curl -fsSL "$index_url" | /usr/bin/grep -oE "node-v${NODE_VERSION}\.[0-9]+\.[0-9]+-${node_os}-${node_arch}\.tar\.xz" | /usr/bin/head -1 || true)"
  [[ -n "$tarball_name" ]] || return 0
  download_url="${index_url}${tarball_name}"
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-node.XXXXXX")"
  download_file "$download_url" "$tmp_dir/$tarball_name"
  run_logged "Installing Node.js runtime" /usr/bin/tar -xf "$tmp_dir/$tarball_name" -C "$tmp_dir" || return 1
  extracted_dir="$(/bin/ls -d "$tmp_dir"/node-v* 2>/dev/null | /usr/bin/head -1)"
  [[ -d "$extracted_dir" ]] || return 1
  /bin/rm -rf "$HERMES_ROOT/node"
  /bin/mkdir -p "$HERMES_ROOT"
  /bin/mv "$extracted_dir" "$HERMES_ROOT/node"
  /bin/rm -rf "$tmp_dir"
  /bin/mkdir -p "$HOME/.local/bin"
  /bin/ln -sf "$HERMES_ROOT/node/bin/node" "$HOME/.local/bin/node"
  /bin/ln -sf "$HERMES_ROOT/node/bin/npm" "$HOME/.local/bin/npm"
  /bin/ln -sf "$HERMES_ROOT/node/bin/npx" "$HOME/.local/bin/npx"
  export PATH="$HERMES_ROOT/node/bin:$PATH"
}

install_hermes_from_source() {
  local source_tarball="$TMPDIR/hermes-agent-source.tar.gz"
  local python_path
  download_file "$HERMES_SOURCE_URL" "$source_tarball"
  /bin/rm -rf "$HERMES_AGENT_ROOT"
  /bin/mkdir -p "$HERMES_AGENT_ROOT"
  run_logged "Extracting Hermes source" /usr/bin/tar --strip-components=1 -xzf "$source_tarball" -C "$HERMES_AGENT_ROOT" || return 1
  run_logged "Installing Python $PYTHON_VERSION" "$UV_CMD" python install "$PYTHON_VERSION" || return 1
  run_logged "Creating Hermes virtual environment" "$UV_CMD" venv "$HERMES_AGENT_ROOT/venv" --python "$PYTHON_VERSION" || return 1
  export VIRTUAL_ENV="$HERMES_AGENT_ROOT/venv"
  /bin/mkdir -p "$SHIM_DIR"
  cat > "$SHIM_DIR/install_name_tool" <<'SHIM'
#!/bin/sh
# Prevent macOS from launching the Command Line Tools installer on clean Macs.
exit 0
SHIM
  /bin/chmod +x "$SHIM_DIR/install_name_tool"
  export INSTALL_NAME_TOOL="$SHIM_DIR/install_name_tool"
  export PATH="$SHIM_DIR:$PATH"
  (
    cd "$HERMES_AGENT_ROOT"
    "$UV_CMD" pip install --only-binary=:all: -e ".[${HERMES_EXTRAS}]"
  ) >> "$LOG_FILE" 2>&1 &
  local pid="$!"
  local start now elapsed exit_code
  start="$(/bin/date +%s)"
  printf "   Installing Hermes Python packages... 0s"
  while kill -0 "$pid" >/dev/null 2>&1; do
    now="$(/bin/date +%s)"
    elapsed=$((now - start))
    printf "\r   Installing Hermes Python packages... %s" "$(format_seconds "$elapsed")"
    sleep 1
  done
  set +e
  wait "$pid"
  exit_code=$?
  set -e
  now="$(/bin/date +%s)"
  elapsed=$((now - start))
  if (( exit_code == 0 )); then
    printf "\r   Installing Hermes Python packages... done in %s\n" "$(format_seconds "$elapsed")"
  else
    printf "\r   Installing Hermes Python packages... failed after %s\n" "$(format_seconds "$elapsed")"
    return "$exit_code"
  fi
  run_logged "Installing Telegram support" "$UV_CMD" pip install --only-binary=:all: "${TELEGRAM_PACKAGES[@]}" || return 1

  /bin/mkdir -p "$HOME/.local/bin" "$HERMES_ROOT"/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,skills}
  /bin/ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"
  if [[ ! -f "$HERMES_ROOT/.env" ]]; then
    if [[ -f "$HERMES_AGENT_ROOT/.env.example" ]]; then
      /bin/cp "$HERMES_AGENT_ROOT/.env.example" "$HERMES_ROOT/.env"
    else
      : > "$HERMES_ROOT/.env"
    fi
  fi
  if [[ ! -f "$HERMES_ROOT/config.yaml" && -f "$HERMES_AGENT_ROOT/cli-config.yaml.example" ]]; then
    /bin/cp "$HERMES_AGENT_ROOT/cli-config.yaml.example" "$HERMES_ROOT/config.yaml"
  fi
  if [[ -f "$HERMES_AGENT_ROOT/tools/skills_sync.py" ]]; then
    "$HERMES_AGENT_ROOT/venv/bin/python" "$HERMES_AGENT_ROOT/tools/skills_sync.py" >> "$LOG_FILE" 2>&1 || true
  fi
}

need_profile_payload() {
  if [[ -n "$PROFILE_TARBALL" && -f "$PROFILE_TARBALL" ]]; then
    printf "%s" "$PROFILE_TARBALL"
    return 0
  fi
  if [[ -z "$PROFILE_URL" && -n "$BASE_URL" ]]; then
    PROFILE_URL="$BASE_URL/infobiz-agent-profile-$AGENT_PROFILE-$VERSION.tar.gz"
  fi
  [[ -n "$PROFILE_URL" ]] || fail "PROFILE_URL or BASE_URL is not set."
  local downloaded="$TMPDIR/infobiz-agent-profile-$AGENT_PROFILE.tar.gz"
  download_file "$PROFILE_URL" "$downloaded"
  printf "%s" "$downloaded"
}

read_token() {
  printf "\nTelegram Bot Token можно оставить пустым и добавить позже.\n" >&2
  printf "Telegram Bot Token: " >&2
  local token
  read -r token
  printf "%s" "$token"
}

replace_student_paths() {
  local root="$1"
  find "$root" -type f \( \
    -name '*.yaml' -o -name '*.yml' -o -name '*.md' -o -name '*.txt' -o \
    -name '*.json' -o -name '*.py' -o -name '*.sh' \
  \) -print0 | while IFS= read -r -d '' file; do
    /usr/bin/perl -0pi \
      -e 'BEGIN { $home = $ENV{"HOME"} } s#/Users/serditov#$home#g; s#/Users/nata#$home#g' \
      "$file"
  done
}

say "Starting Infobiz Agents installer: $AGENT_NAME"
printf "Detected Mac architecture: %s\n" "$ARCH"
mkdir -p "$INSTALL_ROOT" "$CONFIG_DIR"
: > "$LOG_FILE"
printf "Infobiz Agents install log\nStarted: %s\nMac architecture: %s\n" "$(/bin/date)" "$ARCH" >> "$LOG_FILE"

say "Installing Hermes from official repository"
if [[ -d "$HERMES_ROOT" ]]; then
  backup="$HOME/.hermes.backup.$(/bin/date +%Y%m%d%H%M%S)"
  /bin/mv "$HERMES_ROOT" "$backup"
  printf "Existing ~/.hermes moved to %s\n" "$backup"
fi
/bin/mkdir -p "$HERMES_ROOT"
ensure_uv || fail "Could not install uv"
install_node_runtime || fail "Could not install Node.js runtime"
install_hermes_from_source || fail "Hermes source install failed"

[[ -x "$HERMES_CMD" ]] || fail "Hermes command not found: $HERMES_CMD"

say "Installing agent profile: $AGENT_NAME"
profile_payload="$(need_profile_payload)"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-profile.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT
run_logged "Extracting agent profile" /usr/bin/tar -xzf "$profile_payload" -C "$workdir" || fail "Could not extract agent profile"
[[ -d "$workdir/profile" ]] || fail "Profile payload is invalid: profile/ not found"

if [[ -d "$PROFILE_ROOT" ]]; then
  backup="$HOME/.hermes.profile-$AGENT_PROFILE.backup.$(/bin/date +%Y%m%d%H%M%S)"
  /bin/mv "$PROFILE_ROOT" "$backup"
  printf "Existing profile moved to %s\n" "$backup"
fi
/bin/mkdir -p "$HERMES_ROOT/profiles"
/usr/bin/ditto "$workdir/profile" "$PROFILE_ROOT"
/usr/bin/xattr -dr com.apple.quarantine "$PROFILE_ROOT" >/dev/null 2>&1 || true
/usr/bin/xattr -dr com.apple.provenance "$PROFILE_ROOT" >/dev/null 2>&1 || true
replace_student_paths "$PROFILE_ROOT"
/bin/mkdir -p "$PROFILE_ROOT/logs" "$PROFILE_ROOT/sessions" "$PROFILE_ROOT/cache" "$PROFILE_ROOT/memories" "$PROFILE_ROOT/cron"

telegram_token="$(read_token)"

say "Writing agent configuration"
cat > "$PROFILE_ROOT/.env" <<ENV
TELEGRAM_BOT_TOKEN=$(shell_quote "$telegram_token")
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_HOME=$(shell_quote "$PROFILE_ROOT")
PATH=$(shell_quote "$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
ENV
chmod 600 "$PROFILE_ROOT/.env"

if [[ -f "$HERMES_ROOT/.env" ]]; then
  {
    printf "\n# Infobiz Agents defaults\n"
    printf "HERMES_INFERENCE_PROVIDER='openai-codex'\n"
    printf "HERMES_INFERENCE_MODEL='gpt-5.5'\n"
  } >> "$HERMES_ROOT/.env"
fi

say "OpenAI/Hermes authorization"
printf "Follow the Hermes authorization instructions below. After auth finishes, installer will continue.\n"
HERMES_HOME="$HERMES_ROOT" "$HERMES_CMD" auth add openai-codex || fail "OpenAI/Hermes authorization failed"

say "Installing Hermes gateway service for profile: $AGENT_PROFILE"
HERMES_HOME="$HERMES_ROOT" "$HERMES_CMD" -p "$AGENT_PROFILE" gateway install --force >> "$LOG_FILE" 2>&1 || true

say "Starting Hermes gateway"
HERMES_HOME="$HERMES_ROOT" "$HERMES_CMD" -p "$AGENT_PROFILE" gateway start >> "$LOG_FILE" 2>&1 || true

say "Done"
printf "Installed %s. Send a message to the connected Telegram bot.\n" "$AGENT_NAME"
printf "Log file: %s\n" "$LOG_FILE"
