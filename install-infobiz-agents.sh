#!/bin/zsh
set -euo pipefail

AGENT_PROFILE="${AGENT_PROFILE:-marketer}"
AGENT_NAME="${AGENT_NAME:-Маркетолог}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-}"
PAYLOAD_URL="${PAYLOAD_URL:-}"
PAYLOAD_TARBALL="${PAYLOAD_TARBALL:-}"
ARCH="$(uname -m)"

INSTALL_ROOT="$HOME/InfobizAgents"
CONFIG_DIR="$HOME/.infobiz-agents"
HERMES_ROOT="$HOME/.hermes"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
RUNTIME_ROOT="$INSTALL_ROOT/runtime"
PYTHON_ROOT="$RUNTIME_ROOT/python"
PYTHON_BIN="$PYTHON_ROOT/bin/python3.11"
NODE_ROOT="$RUNTIME_ROOT/node"
NODE_BIN="$NODE_ROOT/bin/node"
HERMES_PYTHON="$HERMES_AGENT_ROOT/venv/bin/python3"

say() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  exit 1
}

wait_with_timer() {
  local pid="$1"
  local label="$2"
  local elapsed=0
  while kill -0 "$pid" >/dev/null 2>&1; do
    printf "\r   %s... %ss" "$label" "$elapsed"
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "$pid"
  local exit_code=$?
  printf "\r   %s... done in %ss\n" "$label" "$elapsed"
  return "$exit_code"
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

format_bytes_mb() {
  local bytes="$1"
  /usr/bin/awk -v bytes="$bytes" 'BEGIN { printf "%.1f MB", bytes / 1024 / 1024 }'
}

download_payload() {
  local url="$1"
  local output="$2"

  printf "Downloading installer package. This is about 696 MB.\n" >&2
  curl -fL --progress-bar "$url" -o "$output"
}

extract_payload() {
  local archive="$1"
  local destination="$2"
  local total_file="$destination/.infobiz-extract-total"
  local count_file="$destination/.infobiz-extract-count"
  local total count elapsed eta percent start now exit_code

  printf "Preparing progress estimate...\n"
  (tar -tzf "$archive" | /usr/bin/wc -l | /usr/bin/tr -d ' ' > "$total_file") &
  wait_with_timer "$!" "Scanning archive" || return 1

  total="$(cat "$total_file" 2>/dev/null || printf "0")"
  if [[ -z "$total" || "$total" == "0" ]]; then
    tar -xzf "$archive" -C "$destination"
    return $?
  fi

  printf "This can take a few minutes on a clean Mac.\n"
  printf "Archive entries: %s\n" "$total"
  printf "0" > "$count_file"
  start="$(/bin/date +%s)"

  (
    tar -xzvf "$archive" -C "$destination" 2>&1 | /usr/bin/awk -v file="$count_file" '
      BEGIN { count = 0 }
      {
        count += 1
        if (count % 50 == 0) {
          print count > file
          close(file)
        }
      }
      END {
        print count > file
        close(file)
      }
    '
  ) &
  local extract_pid="$!"

  while kill -0 "$extract_pid" >/dev/null 2>&1; do
    count="$(cat "$count_file" 2>/dev/null || printf "0")"
    [[ -n "$count" ]] || count=0
    now="$(/bin/date +%s)"
    elapsed=$((now - start))
    percent=$((count * 100 / total))
    if (( count > 0 && elapsed > 0 )); then
      eta=$(((total - count) * elapsed / count))
      printf "\r   Extracting: %s/%s (%s%%), elapsed %s, ETA %s" \
        "$count" "$total" "$percent" "$(format_seconds "$elapsed")" "$(format_seconds "$eta")"
    else
      printf "\r   Extracting: %s/%s (%s%%), elapsed %s, ETA calculating..." \
        "$count" "$total" "$percent" "$(format_seconds "$elapsed")"
    fi
    sleep 1
  done

  wait "$extract_pid"
  exit_code=$?
  count="$(cat "$count_file" 2>/dev/null || printf "$total")"
  now="$(/bin/date +%s)"
  elapsed=$((now - start))
  if (( exit_code == 0 )); then
    printf "\r   Extracting: %s/%s (100%%), done in %s               \n" \
      "$count" "$total" "$(format_seconds "$elapsed")"
  else
    printf "\n"
  fi
  return "$exit_code"
}

need_payload() {
  if [[ -n "$PAYLOAD_TARBALL" && -f "$PAYLOAD_TARBALL" ]]; then
    printf "%s" "$PAYLOAD_TARBALL"
    return 0
  fi
  if [[ -z "$PAYLOAD_URL" && -n "$BASE_URL" ]]; then
    PAYLOAD_URL="$BASE_URL/infobiz-agents-$AGENT_PROFILE-macos-$ARCH-$VERSION.tar.gz"
  fi
  if [[ -z "$PAYLOAD_URL" ]]; then
    fail "PAYLOAD_URL or BASE_URL is not set."
  fi
  local downloaded="$TMPDIR/infobiz-agents-payload.tar.gz"
  if ! download_payload "$PAYLOAD_URL" "$downloaded"; then
    if [[ "$ARCH" == "x86_64" ]]; then
      fail "Intel Mac detected, but Intel payload is not available at: $PAYLOAD_URL"
    fi
    fail "Could not download payload: $PAYLOAD_URL"
  fi
  printf "%s" "$downloaded"
}

shell_quote() {
  printf "%s" "$1" | /usr/bin/sed "s/'/'\\\\''/g; 1s/^/'/; \$s/\$/'/"
}

perl_escape_replacement() {
  printf "%s" "$1" | /usr/bin/sed 's/[\/&]/\\&/g'
}

read_token() {
  printf "\nTelegram Bot Token можно оставить пустым и добавить позже.\n" >&2
  printf "Telegram Bot Token: " >&2
  read -r token
  printf "%s" "$token"
}

say "Starting Infobiz Agents installer: $AGENT_NAME"
printf "Detected Mac architecture: %s\n" "$ARCH"
payload="$(need_payload)"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-install.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT

say "Extracting installer payload"
extract_payload "$payload" "$workdir" || fail "Could not extract installer payload"
[[ -d "$workdir/payload/hermes/hermes-agent" ]] || fail "payload/hermes/hermes-agent not found"
[[ -d "$workdir/payload/runtime/python" ]] || fail "payload/runtime/python not found"

telegram_token="$(read_token)"

say "Creating install directories"
mkdir -p "$INSTALL_ROOT" "$CONFIG_DIR" "$RUNTIME_ROOT"

say "Installing Python runtime"
rm -rf "$PYTHON_ROOT"
ditto "$workdir/payload/runtime/python" "$PYTHON_ROOT"
xattr -dr com.apple.quarantine "$PYTHON_ROOT" >/dev/null 2>&1 || true
xattr -dr com.apple.provenance "$PYTHON_ROOT" >/dev/null 2>&1 || true

if [[ -d "$workdir/payload/runtime/node" ]]; then
  say "Installing Node.js runtime"
  rm -rf "$NODE_ROOT"
  ditto "$workdir/payload/runtime/node" "$NODE_ROOT"
  xattr -dr com.apple.quarantine "$NODE_ROOT" >/dev/null 2>&1 || true
  xattr -dr com.apple.provenance "$NODE_ROOT" >/dev/null 2>&1 || true
fi

say "Installing Hermes"
if [[ -d "$HERMES_ROOT" ]]; then
  backup="$HOME/.hermes.backup.$(/bin/date +%Y%m%d%H%M%S)"
  mv "$HERMES_ROOT" "$backup"
  printf "Existing ~/.hermes moved to %s\n" "$backup"
fi
ditto "$workdir/payload/hermes" "$HERMES_ROOT"
touch "$HERMES_ROOT/.infobiz-managed"
mkdir -p "$HERMES_ROOT/logs" "$HERMES_ROOT/sessions" "$HERMES_ROOT/cache"
xattr -dr com.apple.quarantine "$HERMES_ROOT" "$INSTALL_ROOT" >/dev/null 2>&1 || true
xattr -dr com.apple.provenance "$HERMES_ROOT" "$INSTALL_ROOT" >/dev/null 2>&1 || true

[[ -d "$HERMES_AGENT_ROOT/venv/bin" ]] || fail "Hermes venv is missing"
[[ -x "$PYTHON_BIN" ]] || fail "Bundled Python is missing: $PYTHON_BIN"
if [[ -d "$workdir/payload/runtime/node" ]]; then
  [[ -x "$NODE_BIN" ]] || fail "Bundled Node.js is missing: $NODE_BIN"
fi

say "Linking Hermes venv to bundled Python"
rm -f "$HERMES_AGENT_ROOT/venv/bin/python" "$HERMES_AGENT_ROOT/venv/bin/python3" "$HERMES_AGENT_ROOT/venv/bin/python3.11"
ln -s "$PYTHON_BIN" "$HERMES_AGENT_ROOT/venv/bin/python"
ln -s "python" "$HERMES_AGENT_ROOT/venv/bin/python3"
ln -s "python" "$HERMES_AGENT_ROOT/venv/bin/python3.11"
cat > "$HERMES_AGENT_ROOT/venv/pyvenv.cfg" <<PYVENV
home = $PYTHON_ROOT/bin
implementation = CPython
version_info = 3.11
include-system-site-packages = false
PYVENV

escaped_python="$(perl_escape_replacement "$HERMES_PYTHON")"
for script in "$HERMES_AGENT_ROOT"/venv/bin/*; do
  [[ -f "$script" ]] || continue
  first_line="$(/usr/bin/head -n 1 "$script" 2>/dev/null || true)"
  if [[ "$first_line" == '#!'*'/Users/serditov/'* ]]; then
    /usr/bin/perl -0pi -e "s/^#!.*?(\\n)/#!$escaped_python\\1/s" "$script"
  fi
done
xattr -dr com.apple.quarantine "$HERMES_ROOT" "$INSTALL_ROOT" >/dev/null 2>&1 || true
xattr -dr com.apple.provenance "$HERMES_ROOT" "$INSTALL_ROOT" >/dev/null 2>&1 || true

say "Writing agent configuration"
mkdir -p "$HERMES_ROOT/profiles/$AGENT_PROFILE/logs" "$HERMES_ROOT/profiles/$AGENT_PROFILE/sessions"
for config in "$HERMES_ROOT/config.yaml" "$HERMES_ROOT"/profiles/*/config.yaml; do
  [[ -f "$config" ]] || continue
  /usr/bin/sed -i '' \
    -e "s#/Users/serditov/.hermes#$HERMES_ROOT#g" \
    -e "s#/Users/serditov/.hermes-workspaces#$INSTALL_ROOT/workspaces#g" \
    -e "s#/Users/serditov/Documents/New project#$INSTALL_ROOT/workspace#g" \
    "$config"
done

cat > "$HERMES_ROOT/.env" <<ENV
TELEGRAM_BOT_TOKEN=$(shell_quote "$telegram_token")
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_HOME=$(shell_quote "$HERMES_ROOT")
PATH=$(shell_quote "$NODE_ROOT/bin:$HERMES_AGENT_ROOT/venv/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
ENV
chmod 600 "$HERMES_ROOT/.env"

cat > "$HERMES_ROOT/profiles/$AGENT_PROFILE/.env" <<ENV
TELEGRAM_BOT_TOKEN=$(shell_quote "$telegram_token")
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_HOME=$(shell_quote "$HERMES_ROOT/profiles/$AGENT_PROFILE")
PATH=$(shell_quote "$NODE_ROOT/bin:$HERMES_AGENT_ROOT/venv/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
ENV
chmod 600 "$HERMES_ROOT/profiles/$AGENT_PROFILE/.env"

say "Checking bundled Python"
"$HERMES_PYTHON" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" || fail "Bundled Python cannot run"
if [[ -x "$NODE_BIN" ]]; then
  say "Checking bundled Node.js"
  "$NODE_BIN" --version >/dev/null || fail "Bundled Node.js cannot run"
fi

say "OpenAI/Hermes authorization"
printf "Follow the instructions below. After auth finishes, installer will continue.\n"
PATH="$NODE_ROOT/bin:$HERMES_AGENT_ROOT/venv/bin:$PATH" HERMES_HOME="$HERMES_ROOT" HERMES_INFERENCE_PROVIDER=openai-codex HERMES_INFERENCE_MODEL=gpt-5.5 \
  "$HERMES_PYTHON" "$HERMES_AGENT_ROOT/cli.py" auth add openai-codex

say "Installing Hermes gateway service for profile: $AGENT_PROFILE"
PATH="$NODE_ROOT/bin:$HERMES_AGENT_ROOT/venv/bin:$PATH" HERMES_HOME="$HERMES_ROOT" "$HERMES_PYTHON" "$HERMES_AGENT_ROOT/cli.py" --profile "$AGENT_PROFILE" gateway install || true

say "Starting Hermes gateway"
PATH="$NODE_ROOT/bin:$HERMES_AGENT_ROOT/venv/bin:$PATH" HERMES_HOME="$HERMES_ROOT" "$HERMES_PYTHON" "$HERMES_AGENT_ROOT/cli.py" --profile "$AGENT_PROFILE" gateway start || true

say "Done"
printf "Installed %s. Send a message to the connected Telegram bot.\n" "$AGENT_NAME"
