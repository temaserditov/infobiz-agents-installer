#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.cargo/bin"

VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,$AGENT_PROFILES}"

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/update.log"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-update.XXXXXX")"

say() {
  printf "==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

cleanup() {
  /bin/rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

download_file() {
  local url="$1"
  local output="$2"
  /usr/bin/curl -fsSL "$url" -o "$output"
}

replace_student_paths() {
  local root="$1"
  [[ -d "$root" ]] || return 0
  find "$root" -type f \( \
    -name '*.yaml' -o -name '*.yml' -o -name '*.md' -o -name '*.txt' -o \
    -name '*.json' -o -name '*.py' -o -name '*.sh' \
  \) -print0 | while IFS= read -r -d '' file; do
    /usr/bin/perl -0pi \
      -e 'BEGIN { $home = $ENV{"HOME"} } s#/Users/serditov#$home#g; s#/Users/nata#$home#g; s#/Users/romanpanfilov#$home#g' \
      "$file"
  done
}

disable_profile_kanban_dispatch() {
  local profile_root="$1"
  local config_path="$profile_root/config.yaml"
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

enable_telegram_platform() {
  local profile_root="$1"
  local config_path="$profile_root/config.yaml"
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

configure_designer_image_generation() {
  local profile_root="$1"
  local config_path="$profile_root/config.yaml"
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

restart_launch_agent() {
  local label="$1"
  local plist="$2"
  local uid
  uid="$(/usr/bin/id -u)"
  if [[ -f "$plist" ]]; then
    /bin/launchctl bootout "gui/$uid" "$plist" >/dev/null 2>&1 || true
    /bin/launchctl bootstrap "gui/$uid" "$plist" >/dev/null 2>&1 || /bin/launchctl load "$plist" >/dev/null 2>&1 || true
  fi
  /bin/launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1 || true
}

[[ "$(/usr/bin/uname -s)" == "Darwin" ]] || fail "This updater supports macOS only."
[[ -d "$HERMES_AGENT_ROOT" ]] || fail "Hermes is not installed. Run the full installer first."
[[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || fail "Hermes Python venv is missing. Run the full installer first."
[[ -d "$WEB_SHELL_ROOT" ]] || fail "WebShell is not installed. Run the full installer first."

/bin/mkdir -p "$INSTALL_ROOT"
: > "$LOG_FILE"
printf "Infobiz Agents update log\nStarted: %s\n" "$(/bin/date)" >> "$LOG_FILE"

say "Downloading agent update"
profile_payload="$TMP_ROOT/agent-profiles.tar.gz"
download_file "$PROFILE_URL" "$profile_payload" >> "$LOG_FILE" 2>&1 || fail "Could not download agent update"

say "Extracting agent update"
/bin/mkdir -p "$TMP_ROOT/profiles"
/usr/bin/tar -xzf "$profile_payload" -C "$TMP_ROOT/profiles" >> "$LOG_FILE" 2>&1 || fail "Could not extract agent update"
[[ -d "$TMP_ROOT/profiles/profile/agents" || -d "$TMP_ROOT/profiles/profile/skills" ]] || fail "Invalid agent update archive"

say "Updating agent files"
profiles=("${(@s:,:)AGENT_PROFILES}")
for profile in "${profiles[@]}"; do
  profile="$(printf "%s" "$profile" | /usr/bin/xargs)"
  [[ -n "$profile" ]] || continue
  profile_root="$HERMES_ROOT/profiles/$profile"
  source_dir="$TMP_ROOT/profiles/profile/agents/$profile"
  /bin/mkdir -p "$profile_root"
  if [[ -d "$source_dir" ]]; then
    /usr/bin/rsync -a \
      --exclude '.env' \
      --exclude 'config.yaml' \
      --exclude 'sessions/' \
      --exclude 'logs/' \
      --exclude 'memories/' \
      --exclude 'cron/' \
      --exclude 'gateway.pid' \
      "$source_dir/" "$profile_root/" >> "$LOG_FILE" 2>&1
  fi
  if [[ -d "$TMP_ROOT/profiles/profile/skills" ]]; then
    /bin/mkdir -p "$profile_root/skills"
    /usr/bin/rsync -a "$TMP_ROOT/profiles/profile/skills/" "$profile_root/skills/" >> "$LOG_FILE" 2>&1
  fi
  enable_telegram_platform "$profile_root" >> "$LOG_FILE" 2>&1 || true
  disable_profile_kanban_dispatch "$profile_root" >> "$LOG_FILE" 2>&1 || true
  if [[ "$profile" == "designer" ]]; then
    configure_designer_image_generation "$profile_root" >> "$LOG_FILE" 2>&1 || fail "Could not configure GPT-Image 2 High for designer"
  fi
  replace_student_paths "$profile_root"
done

if [[ -d "$TMP_ROOT/profiles/profile/default" ]]; then
  /usr/bin/rsync -a \
    --exclude '.env' \
    --exclude 'config.yaml' \
    --exclude 'sessions/' \
    --exclude 'logs/' \
    --exclude 'memories/' \
    --exclude 'profiles/' \
    --exclude 'hermes-agent/' \
    --exclude 'node/' \
    "$TMP_ROOT/profiles/profile/default/" "$HERMES_ROOT/" >> "$LOG_FILE" 2>&1
fi

if [[ -d "$TMP_ROOT/profiles/profile/skills/webshell-docs" ]]; then
  /bin/mkdir -p "$HERMES_ROOT/skills"
  /bin/rm -rf "$HERMES_ROOT/skills/webshell-docs"
  /usr/bin/ditto "$TMP_ROOT/profiles/profile/skills/webshell-docs" "$HERMES_ROOT/skills/webshell-docs" >> "$LOG_FILE" 2>&1
fi

say "Updating WebShell files"
web_payload="$TMP_ROOT/agent-web-shell.tar.gz"
download_file "$WEB_SHELL_URL" "$web_payload" >> "$LOG_FILE" 2>&1 || fail "Could not download WebShell update"
/usr/bin/tar -xzf "$web_payload" -C "$TMP_ROOT" >> "$LOG_FILE" 2>&1 || fail "Could not extract WebShell update"
[[ -d "$TMP_ROOT/web-shell" ]] || fail "Invalid WebShell update archive"
/usr/bin/rsync -a --delete \
  --exclude 'docs.json' \
  --exclude 'groups.json' \
  --exclude 'runs/' \
  --exclude 'preflights/' \
  --exclude 'snapshots/' \
  --exclude 'uploads/' \
  --exclude 'approvals/' \
  "$TMP_ROOT/web-shell/" "$WEB_SHELL_ROOT/" >> "$LOG_FILE" 2>&1

say "Restarting services"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
restart_launch_agent "com.infobiz.agents.web-shell" "$LAUNCH_AGENTS/com.infobiz.agents.web-shell.plist"
restart_launch_agent "ai.hermes.gateway" "$LAUNCH_AGENTS/ai.hermes.gateway.plist"
for profile in "${profiles[@]}"; do
  profile="$(printf "%s" "$profile" | /usr/bin/xargs)"
  [[ -n "$profile" ]] || continue
  restart_launch_agent "ai.hermes.gateway-$profile" "$LAUNCH_AGENTS/ai.hermes.gateway-$profile.plist"
done

say "Update complete"
if [[ -f "$INSTALL_ROOT/web-shell.url" ]]; then
  printf "WebShell: %s\n" "$(/usr/bin/head -n 1 "$INSTALL_ROOT/web-shell.url")"
fi
