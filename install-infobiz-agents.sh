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
HERMES_INSTALL_URL="${HERMES_INSTALL_URL:-https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh}"
ARCH="$(/usr/bin/uname -m)"

INSTALL_ROOT="$HOME/InfobizAgents"
CONFIG_DIR="$HOME/.infobiz-agents"
HERMES_ROOT="$HOME/.hermes"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
PROFILE_ROOT="$HERMES_ROOT/profiles/$AGENT_PROFILE"
LOG_FILE="$INSTALL_ROOT/install.log"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"

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
  printf "   Downloading: %s\n" "$url"
  curl -fL --progress-bar "$url" -o "$output" >> "$LOG_FILE" 2>&1
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
      -e "s#/Users/serditov#$ENV{HOME}#g" \
      -e "s#/Users/nata#$ENV{HOME}#g" \
      "$file"
  done
}

say "Starting Infobiz Agents installer: $AGENT_NAME"
printf "Detected Mac architecture: %s\n" "$ARCH"
mkdir -p "$INSTALL_ROOT" "$CONFIG_DIR"
: > "$LOG_FILE"
printf "Infobiz Agents install log\nStarted: %s\nMac architecture: %s\n" "$(/bin/date)" "$ARCH" >> "$LOG_FILE"

say "Installing Hermes from official repository"
official_installer="$TMPDIR/hermes-install.sh"
download_file "$HERMES_INSTALL_URL" "$official_installer"
chmod +x "$official_installer"
run_logged "Installing Hermes dependencies and runtime" /bin/bash "$official_installer" \
  --skip-setup \
  --branch "$HERMES_BRANCH" \
  --hermes-home "$HERMES_ROOT" || fail "Hermes official installer failed"

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
