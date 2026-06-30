#!/usr/bin/env bash
set -euo pipefail

AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,marketer,copywriter,designer,tech}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v${VERSION}}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
HERMES_BRANCH="${HERMES_BRANCH:-main}"
HERMES_SOURCE_URL="${HERMES_SOURCE_URL:-https://github.com/NousResearch/hermes-agent/archive/refs/heads/$HERMES_BRANCH.tar.gz}"
HERMES_IMAGE_REFERENCE_PATCH_URL="${HERMES_IMAGE_REFERENCE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-image-reference.py}"
HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL="${HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-telegram-text-photo-merge.py}"
HERMES_RUNTIME_SAFETY_PATCH_URL="${HERMES_RUNTIME_SAFETY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-codex-runtime-safety.py}"
AGENT_RUSSIAN_ONLY_PATCH_URL="${AGENT_RUSSIAN_ONLY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-agent-russian-only.py}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
HERMES_EXTRAS="${HERMES_EXTRAS:-cli,mcp}"
NODE_VERSION="${NODE_VERSION:-22}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST="${WEB_SHELL_HOST:-0.0.0.0}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
WEB_SHELL_ACCESS_TOKEN="${WEB_SHELL_ACCESS_TOKEN:-}"
STUDENT_UI="${STUDENT_UI:-1}"

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/install.log"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
UV_CMD=""
TMP_ROOT="${TMPDIR:-/tmp}/infobiz-vps-install.$$"
PROGRESS_STEP=0
PROGRESS_TOTAL=11

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
  printf "\nЭто может занять несколько минут. Подробный лог пишется на сервере.\n"
}

progress_stage() {
  local label="$1"
  if (( PROGRESS_STEP < PROGRESS_TOTAL )); then
    PROGRESS_STEP=$((PROGRESS_STEP + 1))
  fi
  render_progress "$label"
}

fail() {
  [[ "$STUDENT_UI" == "1" ]] && printf "\n"
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
  [[ "$STUDENT_UI" != "1" ]] && printf "   Downloading: %s\n" "$url"
  printf "Downloading: %s\n" "$url" >> "$LOG_FILE"
  if [[ "$STUDENT_UI" == "1" ]]; then
    curl -fsSL "$url" -o "$output" >> "$LOG_FILE" 2>&1
  else
    curl -fL --progress-bar "$url" -o "$output" 2> >(tee -a "$LOG_FILE" >&2)
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

patch_official_hermes_setup() {
  local setup_path="$HERMES_AGENT_ROOT/setup-hermes.sh"
  local tmp_path="$setup_path.infobiz"
  [[ -f "$setup_path" ]] || return 1
  awk -v extras="$HERMES_EXTRAS" '
    {
      gsub(/\.\[all\]/, ".[" extras "]");
      if (index($0, "read -p") && index($0, "Install ripgrep for faster search")) {
        sub(/read -p.*/, "REPLY=n");
      }
      if (index($0, "read -p") && index($0, "Would you like to run the setup wizard now")) {
        sub(/read -p.*/, "REPLY=n");
      }
      print;
    }
  ' "$setup_path" > "$tmp_path"
  mv "$tmp_path" "$setup_path"
  chmod +x "$setup_path"
}

patch_hermes_image_reference_support() {
  local patcher="$TMP_ROOT/patch-hermes-image-reference.py"
  curl -fsSL "$HERMES_IMAGE_REFERENCE_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_telegram_text_photo_merge_support() {
  local patcher="$TMP_ROOT/patch-telegram-text-photo-merge.py"
  curl -fsSL "$HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_hermes_codex_runtime_safety() {
  local patcher="$TMP_ROOT/patch-hermes-codex-runtime-safety.py"
  curl -fsSL "$HERMES_RUNTIME_SAFETY_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --hermes-agent-root "$HERMES_AGENT_ROOT" \
    --profiles "$AGENT_PROFILES"
}

patch_agents_russian_only() {
  local patcher="$TMP_ROOT/patch-agent-russian-only.py"
  curl -fsSL "$AGENT_RUSSIAN_ONLY_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "$AGENT_PROFILES"
}

install_hermes_from_source() {
  local source_tarball="$TMP_ROOT/hermes-agent-source.tar.gz"
  download_file "$HERMES_SOURCE_URL" "$source_tarball"
  rm -rf "$HERMES_AGENT_ROOT"
  mkdir -p "$HERMES_AGENT_ROOT"
  run_logged "Extracting Hermes source" tar --strip-components=1 -xzf "$source_tarball" -C "$HERMES_AGENT_ROOT"
  patch_official_hermes_setup
  run_logged "Running official Hermes setup" bash -lc "cd '$HERMES_AGENT_ROOT' && HERMES_HOME='$HERMES_ROOT' bash ./setup-hermes.sh"
  [[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || fail "Official Hermes setup did not create Python venv"
  [[ -x "$HERMES_CMD" ]] || fail "Official Hermes setup did not create Hermes command"
  run_logged "Installing Telegram support" "$UV_CMD" pip install --python "$HERMES_AGENT_ROOT/venv/bin/python" --only-binary=:all: "python-telegram-bot[webhooks]==22.6" "aiohttp==3.13.3" "qrcode==7.4.2"
  mkdir -p "$HOME/.local/bin" "$HERMES_ROOT"/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,skills}
  ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"
  [[ -f "$HERMES_ROOT/.env" ]] || cp "$HERMES_AGENT_ROOT/.env" "$HERMES_ROOT/.env" 2>/dev/null || cp "$HERMES_AGENT_ROOT/.env.example" "$HERMES_ROOT/.env" 2>/dev/null || : > "$HERMES_ROOT/.env"
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
GROQ_API_KEY=''
STT_GROQ_MODEL='whisper-large-v3-turbo'
INFOBIZ_VOICE_ENGINE='local'
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.3'
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
  HERMES_MODEL_CANDIDATES="${HERMES_MODEL_CANDIDATES:-gpt-5.5,gpt-5.3,gpt-5.2,gpt-5.1,gpt-5,gpt-4.1}" \
  "$HERMES_AGENT_ROOT/venv/bin/python" <<'PY' >> "$LOG_FILE" 2>&1
import os
import re
import subprocess
from pathlib import Path

try:
    import yaml
except Exception as exc:
    print(f"PyYAML unavailable: {exc}")
    yaml = None

home = Path(os.environ["HERMES_ROOT"]).expanduser()
agent_root = Path(os.environ["HERMES_AGENT_ROOT"]).expanduser()
python = agent_root / "venv" / "bin" / "python"
profiles = ["default"] + [p.strip() for p in os.environ.get("AGENT_PROFILES", "").split(",") if p.strip()]
candidates = [m.strip() for m in os.environ.get("HERMES_MODEL_CANDIDATES", "").split(",") if m.strip()]
prompt = "Return exactly MODEL_OK and nothing else."

def profile_dir(profile):
    return home if profile == "default" else home / "profiles" / profile

def env_quote(value):
    return "'" + value.replace("'", "'\\''") + "'"

def write_env_value(path, key, value):
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    line = f"{key}={env_quote(value)}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    text = pattern.sub(line, text) if pattern.search(text) else text.rstrip() + "\n" + line + "\n"
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)

def write_config_model(path, model):
    if yaml:
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
        model_cfg.setdefault("context_length", 100000)
        model_cfg["openai_runtime"] = "codex_app_server"
        model_cfg["api_mode"] = "codex_app_server"
        compression = data.setdefault("compression", {})
        if not isinstance(compression, dict):
            compression = {}
            data["compression"] = compression
        compression["enabled"] = False
        memory = data.setdefault("memory", {})
        if not isinstance(memory, dict):
            memory = {}
            data["memory"] = memory
        memory["nudge_interval"] = 0
        memory["flush_min_turns"] = 0
        skills = data.setdefault("skills", {})
        if not isinstance(skills, dict):
            skills = {}
            data["skills"] = skills
        skills["creation_nudge_interval"] = 0
        auxiliary = data.setdefault("auxiliary", {})
        if not isinstance(auxiliary, dict):
            auxiliary = {}
            data["auxiliary"] = auxiliary
        title_generation = auxiliary.setdefault("title_generation", {})
        if not isinstance(title_generation, dict):
            title_generation = {}
            auxiliary["title_generation"] = title_generation
        title_generation["enabled"] = False
        title_generation["provider"] = ""
        title_generation["model"] = ""
        title_generation["base_url"] = ""
        title_generation["api_key"] = ""
        aux_compression = auxiliary.setdefault("compression", {})
        if not isinstance(aux_compression, dict):
            aux_compression = {}
            auxiliary["compression"] = aux_compression
        aux_compression["provider"] = ""
        aux_compression["model"] = ""
        aux_compression["base_url"] = ""
        aux_compression["api_key"] = ""
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        return
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    if re.search(r"(?m)^model:\s*$", text):
        text = re.sub(r"(?m)^  default:\s*.*$", f"  default: {model}", text)
        text = re.sub(r"(?m)^  provider:\s*.*$", "  provider: openai-codex", text)
    else:
        text = f"model:\n  default: {model}\n  provider: openai-codex\n  base_url: https://chatgpt.com/backend-api/codex\n  context_length: 100000\n\n" + text
    path.write_text(text, encoding="utf-8")

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
    selected = os.environ.get("HERMES_MODEL_FALLBACK", "gpt-5.3")
    print(f"No candidate probe succeeded; falling back to {selected}")
else:
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

install_profiles_and_skills() {
  local payload="$TMP_ROOT/profile.tar.gz"
  local workdir="$TMP_ROOT/profile"
  local profile source_dir skill_count
  download_file "$PROFILE_URL" "$payload"
  mkdir -p "$workdir"
  run_logged "Extracting agent profiles" tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/profile/agents" || -d "$workdir/profile/skills" ]] || fail "Profile payload is invalid"

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
    systemctl enable --now "$service" || true
  done
}

open_firewall_if_available() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "$WEB_SHELL_PORT/tcp" >/dev/null 2>&1 || true
  fi
}

run_openai_auth() {
  if [[ "$STUDENT_UI" == "1" ]]; then
    printf "\033[2J\033[H"
    printf "Нужна авторизация OpenAI\n\n"
    printf "Сейчас появится ссылка и код. Открой ссылку на своем компьютере или телефоне,\n"
    printf "введи код, и установка продолжится автоматически.\n\n"
  else
    say "OpenAI/Hermes authorization"
    printf "Follow the device-code instructions below. Open the URL on your computer or phone.\n"
  fi
  run_hermes auth add openai-codex
}

main() {
  mkdir -p "$INSTALL_ROOT" "$TMP_ROOT"
  : > "$LOG_FILE"
  printf "Infobiz Agents VPS install log\nStarted: %s\n" "$(date)" >> "$LOG_FILE"
  [[ "$STUDENT_UI" == "1" ]] && render_progress "Подготовка"
  require_linux
  say "Installing Infobiz Agents VPS stack"
  progress_stage "Подготовка сервера"
  install_system_packages
  progress_stage "Установка менеджера Python"
  ensure_uv
  progress_stage "Установка Node.js"
  install_node_runtime
  progress_stage "Установка Hermes официальным установщиком"
  install_hermes_from_source
  patch_hermes_image_reference_support >> "$LOG_FILE" 2>&1
  patch_telegram_text_photo_merge_support >> "$LOG_FILE" 2>&1
  progress_stage "Создание агентов и установка скиллов"
  install_profiles_and_skills
  patch_agents_russian_only >> "$LOG_FILE" 2>&1 || fail "Could not patch Russian-only agent language"
  run_openai_auth
  apply_best_available_model
  patch_hermes_codex_runtime_safety >> "$LOG_FILE" 2>&1 || fail "Could not patch Hermes Codex runtime safety"
  progress_stage "Установка WebShell"
  install_web_shell
  progress_stage "Запуск панели агентов"
  install_systemd_services
  progress_stage "Запуск gateway-сервисов"
  install_gateway_systemd_services
  progress_stage "Открытие доступа"
  open_firewall_if_available

  public_host="$(detect_public_host)"
  public_url="http://$public_host:$WEB_SHELL_PORT/?token=$WEB_SHELL_ACCESS_TOKEN"
  printf "%s\n" "$public_url" > "$INSTALL_ROOT/web-shell.url"

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

main "$@"
