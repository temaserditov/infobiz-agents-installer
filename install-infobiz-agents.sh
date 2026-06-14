#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.cargo/bin"
case "${LANG:-}" in
  ""|C.UTF-8) export LANG="en_US.UTF-8" ;;
esac
case "${LC_ALL:-}" in
  ""|C.UTF-8) export LC_ALL="en_US.UTF-8" ;;
esac
case "${LC_CTYPE:-}" in
  ""|C.UTF-8) export LC_CTYPE="en_US.UTF-8" ;;
esac

AGENT_PROFILE="${AGENT_PROFILE:-marketer}"
AGENT_PROFILES="${AGENT_PROFILES:-marketer,copywriter,designer,tech}"
AGENT_NAME="${AGENT_NAME:-Гермес и агенты}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,$AGENT_PROFILES}"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-}"
PROFILE_URL="${PROFILE_URL:-}"
PROFILE_TARBALL="${PROFILE_TARBALL:-}"
WEB_SHELL_URL="${WEB_SHELL_URL:-}"
WEB_SHELL_TARBALL="${WEB_SHELL_TARBALL:-}"
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST="${WEB_SHELL_HOST:-127.0.0.1}"
WEB_SHELL_PUBLIC_URL="${WEB_SHELL_PUBLIC_URL:-}"
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
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/install.log"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
UV_CMD=""
SHIM_DIR="$INSTALL_ROOT/shims"
CLEANUP_WORKDIR=""
FAILURE_SUPPORT_PORT="${FAILURE_SUPPORT_PORT:-8797}"
FAILURE_SUPPORT_TOKEN=""
FAILURE_SUPPORT_STARTED=""

say() {
  printf "\n==> %s\n" "$1"
}

fail() {
  start_failure_support_server || true
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  if [[ -n "$FAILURE_SUPPORT_STARTED" ]]; then
    printf "Support URL: %s\n" "$FAILURE_SUPPORT_STARTED" >&2
  fi
  exit 1
}

cleanup() {
  if [[ -n "$CLEANUP_WORKDIR" ]]; then
    /bin/rm -rf "$CLEANUP_WORKDIR"
  fi
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

detect_lan_ip() {
  local ip=""
  ip="$(/usr/sbin/ipconfig getifaddr en0 2>/dev/null || true)"
  [[ -n "$ip" ]] || ip="$(/usr/sbin/ipconfig getifaddr en1 2>/dev/null || true)"
  [[ -n "$ip" ]] || ip="127.0.0.1"
  printf "%s" "$ip"
}

random_support_token() {
  if [[ -x /usr/bin/openssl ]]; then
    /usr/bin/openssl rand -hex 24
    return
  fi
  /bin/date +%s | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}'
}

start_failure_support_server() {
  [[ "${INFOBIZ_SUPPORT_ON_FAIL:-1}" == "1" ]] || return 0
  [[ -z "$FAILURE_SUPPORT_STARTED" ]] || return 0
  [[ -f "$LOG_FILE" ]] || return 0

  local node_cmd=""
  if [[ -x "$HERMES_ROOT/node/bin/node" ]]; then
    node_cmd="$HERMES_ROOT/node/bin/node"
  elif command -v node >/dev/null 2>&1; then
    node_cmd="$(command -v node)"
  else
    return 0
  fi

  local support_dir server_js lan_ip url
  support_dir="$INSTALL_ROOT/support"
  /bin/mkdir -p "$support_dir"
  FAILURE_SUPPORT_TOKEN="$(random_support_token)"
  server_js="$support_dir/failure-support.mjs"

  cat > "$server_js" <<JS
import http from "node:http";
import os from "node:os";
import { existsSync, readFileSync } from "node:fs";

const token = process.env.SUPPORT_TOKEN;
const logFile = process.env.LOG_FILE;
const startedAt = new Date().toISOString();

function tail(text, max = 50000) {
  text = String(text || "");
  return text.length > max ? text.slice(text.length - max) : text;
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body, null, 2));
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.searchParams.get("token") !== token) {
    json(res, 403, { ok: false, error: "bad token" });
    return;
  }
  const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  json(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    startedAt,
    runtime: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      user: os.userInfo().username,
      home: os.homedir(),
      node: process.version,
      installRoot: process.env.INSTALL_ROOT,
      hermesRoot: process.env.HERMES_ROOT,
      hermesAgentRoot: process.env.HERMES_AGENT_ROOT,
    },
    files: {
      logFile,
      logExists: existsSync(logFile),
    },
    logs: {
      install: tail(log),
    },
  });
}).listen(Number(process.env.PORT), "0.0.0.0");
JS

  SUPPORT_TOKEN="$FAILURE_SUPPORT_TOKEN" \
  LOG_FILE="$LOG_FILE" \
  INSTALL_ROOT="$INSTALL_ROOT" \
  HERMES_ROOT="$HERMES_ROOT" \
  HERMES_AGENT_ROOT="$HERMES_AGENT_ROOT" \
  PORT="$FAILURE_SUPPORT_PORT" \
    "$node_cmd" "$server_js" >> "$support_dir/failure-support.out.log" 2>> "$support_dir/failure-support.err.log" &

  lan_ip="$(detect_lan_ip)"
  url="http://$lan_ip:$FAILURE_SUPPORT_PORT/api/support/bundle?token=$FAILURE_SUPPORT_TOKEN"
  printf "%s\n" "$url" > "$support_dir/failure-support.url"
  FAILURE_SUPPORT_STARTED="$url"
}

download_file() {
  local url="$1"
  local output="$2"
  printf "   Downloading: %s\n" "$url" >&2
  printf "Downloading: %s\n" "$url" >> "$LOG_FILE"
  curl -fL --progress-bar "$url" -o "$output" 2> >(/usr/bin/tee -a "$LOG_FILE" >&2)
}

install_command_shims() {
  /bin/mkdir -p "$SHIM_DIR"
  cat > "$SHIM_DIR/install_name_tool" <<'SHIM'
#!/bin/sh
# Avoid macOS launching the Command Line Tools installer on clean Macs.
exit 0
SHIM
  /bin/chmod +x "$SHIM_DIR/install_name_tool"
  export INSTALL_NAME_TOOL="$SHIM_DIR/install_name_tool"
  export PATH="$SHIM_DIR:$PATH"
}

run_hermes() {
  HERMES_HOME="$HERMES_ROOT" \
    INSTALL_NAME_TOOL="$SHIM_DIR/install_name_tool" \
    PATH="$SHIM_DIR:$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    "$HERMES_CMD" "$@"
}

run_hermes_auth() {
  HERMES_HOME="$HERMES_ROOT" \
    INSTALL_NAME_TOOL="$SHIM_DIR/install_name_tool" \
    PATH="$SHIM_DIR:$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    "$HERMES_AGENT_ROOT/venv/bin/python" - "$HERMES_CMD" auth add openai-codex <<'PY'
import os
import pty
import re
import select
import subprocess
import sys

argv = sys.argv[1:]
url_re = re.compile(r"https?://[^\s)>\]\"']+")
ansi_re = re.compile(r"\x1b\[[0-9;]*m")
code_re = re.compile(r"\b[A-Z0-9][A-Z0-9 -]{3,30}[A-Z0-9]\b")
opened_urls = set()
copied_codes = set()
buffer = ""


def notify(message):
    os.write(sys.stdout.fileno(), f"\n   {message}\n".encode())


def open_url(url):
    if url in opened_urls:
        return
    opened_urls.add(url)
    try:
        subprocess.Popen(
            ["/usr/bin/open", url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        notify("Opened authorization page in your browser.")
    except OSError:
        pass


def copy_code(code, context):
    if code in copied_codes:
        return
    if "code" not in context.lower():
        return
    copied_codes.add(code)
    try:
        subprocess.run(
            ["/usr/bin/pbcopy"],
            input=code,
            text=True,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        notify(f"Copied authorization code to clipboard: {code}")
    except OSError:
        pass


def inspect_output(text):
    global buffer
    buffer = (buffer + text)[-4000:]
    plain = ansi_re.sub("", buffer).replace("\r", "\n")
    for match in url_re.findall(ansi_re.sub("", text)):
        open_url(match.rstrip(".,;:"))
    code_context = ""
    lower_plain = plain.lower()
    marker = lower_plain.rfind("enter this code")
    if marker >= 0:
        code_context = plain[marker:marker + 500]
    else:
        marker = lower_plain.rfind("authorization code")
        if marker >= 0:
            code_context = plain[marker:marker + 500]
    if code_context:
        for raw in code_re.findall(code_context):
            code = re.sub(r"\s+", "-", raw.strip())
            if len(code.replace("-", "")) >= 4:
                copy_code(code, "code: " + code_context)


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
            os.write(sys.stdout.fileno(), data)
            inspect_output(data.decode(errors="ignore"))
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

patch_official_hermes_setup() {
  local setup_path="$HERMES_AGENT_ROOT/setup-hermes.sh"
  local tmp_path="$setup_path.infobiz"
  [[ -f "$setup_path" ]] || return 1
  /usr/bin/awk -v extras="$HERMES_EXTRAS" '
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
  /bin/mv "$tmp_path" "$setup_path"
  /bin/chmod +x "$setup_path"
}

install_hermes_from_source() {
  local source_tarball="$TMPDIR/hermes-agent-source.tar.gz"
  download_file "$HERMES_SOURCE_URL" "$source_tarball"
  /bin/rm -rf "$HERMES_AGENT_ROOT"
  /bin/mkdir -p "$HERMES_AGENT_ROOT"
  run_logged "Extracting Hermes source" /usr/bin/tar --strip-components=1 -xzf "$source_tarball" -C "$HERMES_AGENT_ROOT" || return 1
  patch_official_hermes_setup || return 1
  run_logged "Running official Hermes setup" /bin/bash -lc "cd '$HERMES_AGENT_ROOT' && HERMES_HOME='$HERMES_ROOT' bash ./setup-hermes.sh" || return 1
  [[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || return 1
  [[ -x "$HERMES_CMD" ]] || return 1
  run_logged "Installing Telegram support" "$UV_CMD" pip install --python "$HERMES_AGENT_ROOT/venv/bin/python" --only-binary=:all: "${TELEGRAM_PACKAGES[@]}" || return 1

  /bin/mkdir -p "$HOME/.local/bin" "$HERMES_ROOT"/{cron,sessions,logs,pairing,hooks,image_cache,audio_cache,memories,skills}
  /bin/ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"
  if [[ ! -f "$HERMES_ROOT/.env" ]]; then
    if [[ -f "$HERMES_AGENT_ROOT/.env" ]]; then
      /bin/cp "$HERMES_AGENT_ROOT/.env" "$HERMES_ROOT/.env"
    elif [[ -f "$HERMES_AGENT_ROOT/.env.example" ]]; then
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

create_clean_hermes_profile() {
  local profile="$1"
  (
    cd "$HERMES_AGENT_ROOT"
    HERMES_HOME="$HERMES_ROOT" "$HERMES_AGENT_ROOT/venv/bin/python" - "$profile" <<'PY'
import sys
from hermes_cli.profiles import create_profile, seed_profile_skills

profile = sys.argv[1]
profile_dir = create_profile(profile, no_alias=True)
seed_profile_skills(profile_dir, quiet=True)
print(profile_dir)
PY
  ) >> "$LOG_FILE" 2>&1
}

enable_profile_telegram_platform() {
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

write_profile_env() {
  local profile="$1"
  local profile_root
  if [[ "$profile" = "default" ]]; then
    profile_root="$HERMES_ROOT"
  else
    profile_root="$HERMES_ROOT/profiles/$profile"
  fi

  /bin/mkdir -p "$profile_root"
  cat > "$profile_root/.env" <<ENV
TELEGRAM_BOT_TOKEN=''
GATEWAY_ALLOW_ALL_USERS='true'
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_HOME=$(shell_quote "$profile_root")
PATH=$(shell_quote "$SHIM_DIR:$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
INSTALL_NAME_TOOL=$(shell_quote "$SHIM_DIR/install_name_tool")
ENV
  if [[ "$profile" != "default" ]]; then
    printf "HERMES_KANBAN_DISPATCH_IN_GATEWAY='false'\n" >> "$profile_root/.env"
  fi
  chmod 600 "$profile_root/.env"
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
image_gen["model"] = "gpt-image-2-medium"
openai_codex = image_gen.setdefault("openai-codex", {})
if not isinstance(openai_codex, dict):
    openai_codex = {}
    image_gen["openai-codex"] = openai_codex
openai_codex["model"] = "gpt-image-2-medium"

path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
PY
}

install_profiles_and_skills() {
  local profile_payload="$1"
  local workdir="$2"
  local profile source_dir profile_root skill_count
  local profiles

  [[ -d "$workdir/profile/agents" || -d "$workdir/profile/skills" ]] || fail "Profile payload is invalid"

  /bin/mkdir -p "$HERMES_ROOT/profiles"
  profiles=("${(@s:,:)AGENT_PROFILES}")
  for profile in "${profiles[@]}"; do
    profile="$(printf "%s" "$profile" | /usr/bin/xargs)"
    [[ -n "$profile" ]] || continue
    profile_root="$HERMES_ROOT/profiles/$profile"
    source_dir="$workdir/profile/agents/$profile"

    if [[ -d "$profile_root" ]]; then
      backup="$HOME/.hermes.profile-$profile.backup.$(/bin/date +%Y%m%d%H%M%S)"
      /bin/mv "$profile_root" "$backup"
      printf "Existing profile %s moved to %s\n" "$profile" "$backup"
    fi

    create_clean_hermes_profile "$profile" || fail "Could not create clean Hermes profile: $profile"

    if [[ -d "$source_dir" ]]; then
      /usr/bin/rsync -a \
        --exclude '.env' \
        --exclude 'config.yaml' \
        --exclude 'sessions/' \
        --exclude 'logs/' \
        --exclude 'memories/' \
        --exclude 'test-runs/' \
        "$source_dir/" "$profile_root/"
    elif [[ -d "$workdir/profile/skills" ]]; then
      /bin/mkdir -p "$profile_root/skills"
      /usr/bin/rsync -a "$workdir/profile/skills/" "$profile_root/skills/"
    else
      fail "No source files found for profile: $profile"
    fi

    if [[ -d "$workdir/profile/skills" ]]; then
      /bin/mkdir -p "$profile_root/skills"
      /usr/bin/rsync -a "$workdir/profile/skills/" "$profile_root/skills/"
    fi

    skill_count="$(find "$profile_root/skills" -name 'SKILL.md' -type f | wc -l | tr -d ' ')"
    [[ "$skill_count" != "0" ]] || fail "No skills were installed for profile: $profile"
    printf "Installed %s skills for %s\n" "$skill_count" "$profile" >> "$LOG_FILE"

    enable_profile_telegram_platform "$profile_root" || fail "Could not enable Telegram platform for profile: $profile"
    disable_profile_kanban_dispatch "$profile_root" || fail "Could not configure multi-gateway mode for profile: $profile"
    if [[ "$profile" == "designer" ]]; then
      configure_designer_image_generation "$profile_root" || fail "Could not configure GPT-Image 2 for designer"
    fi
    write_profile_env "$profile"
    /usr/bin/xattr -dr com.apple.quarantine "$profile_root" >/dev/null 2>&1 || true
    /usr/bin/xattr -dr com.apple.provenance "$profile_root" >/dev/null 2>&1 || true
    replace_student_paths "$profile_root"
    /bin/mkdir -p "$profile_root/logs" "$profile_root/sessions" "$profile_root/cache" "$profile_root/memories" "$profile_root/cron"
  done

  if [[ -d "$workdir/profile/skills/webshell-docs" ]]; then
    /bin/rm -rf "$HERMES_ROOT/skills/webshell-docs"
    /usr/bin/ditto "$workdir/profile/skills/webshell-docs" "$HERMES_ROOT/skills/webshell-docs"
  fi

  if [[ -d "$workdir/profile/default" ]]; then
    /usr/bin/rsync -a \
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
  enable_profile_telegram_platform "$HERMES_ROOT" || fail "Could not enable Telegram platform for Hermes"
  replace_student_paths "$HERMES_ROOT/skills"
}

need_web_shell_payload() {
  if [[ -n "$WEB_SHELL_TARBALL" && -f "$WEB_SHELL_TARBALL" ]]; then
    printf "%s" "$WEB_SHELL_TARBALL"
    return 0
  fi
  if [[ -z "$WEB_SHELL_URL" && -n "$BASE_URL" ]]; then
    WEB_SHELL_URL="$BASE_URL/agent-web-shell-$VERSION.tar.gz"
  fi
  [[ -n "$WEB_SHELL_URL" ]] || fail "WEB_SHELL_URL or BASE_URL is not set."
  local downloaded="$TMPDIR/agent-web-shell.tar.gz"
  download_file "$WEB_SHELL_URL" "$downloaded"
  printf "%s" "$downloaded"
}

choose_web_shell_port() {
  local port="$WEB_SHELL_PORT"
  local max=$((port + 50))
  while (( port <= max )); do
    if ! /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      printf "%s" "$port"
      return 0
    fi
    port=$((port + 1))
  done
  fail "Could not find a free local port for the agent web panel"
}

install_web_shell() {
  local payload workdir node_cmd port plist label uid url
  local api_url
  payload="$(need_web_shell_payload)"
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-web-shell.XXXXXX")"
  /usr/bin/tar -xzf "$payload" -C "$workdir" || return 1
  [[ -d "$workdir/web-shell" ]] || return 1

  /bin/rm -rf "$WEB_SHELL_ROOT"
  /bin/mkdir -p "$INSTALL_ROOT"
  /usr/bin/ditto "$workdir/web-shell" "$WEB_SHELL_ROOT"
  /bin/rm -rf "$workdir"
  /usr/bin/xattr -dr com.apple.quarantine "$WEB_SHELL_ROOT" >/dev/null 2>&1 || true
  /usr/bin/xattr -dr com.apple.provenance "$WEB_SHELL_ROOT" >/dev/null 2>&1 || true
  if [[ -f "$WEB_SHELL_ROOT/server.mjs" ]]; then
    /usr/bin/perl -0pi -e 's#join\(HERMES_AGENT_ROOT, "venv", "bin", "python3"\)#join(HERMES_AGENT_ROOT, "venv", "bin", "python")#g' "$WEB_SHELL_ROOT/server.mjs"
    "$HERMES_AGENT_ROOT/venv/bin/python" - "$WEB_SHELL_ROOT/server.mjs" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

helper = r'''
function ensureTelegramPlatformEnabled(agentId) {
  const configPath = join(profileDir(agentId), "config.yaml");
  let text = readText(configPath, "");
  if (/^platforms:\s*$/m.test(text) && /(^|\n)  telegram:\s*\n(?:    .*\n)*?    enabled:\s*true\b/m.test(text)) return;
  text = `${text.replace(/\s*$/, "")}\n\n# Infobiz Agents messaging defaults\nplatforms:\n  telegram:\n    enabled: true\n`;
  writeFileSync(configPath, text, { encoding: "utf8", mode: 0o600 });
}
'''

if "function ensureTelegramPlatformEnabled(agentId)" not in text:
    marker = "function telegramSettings(agentId) {"
    text = text.replace(marker, helper + "\n" + marker)

needle = '  writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });\n'
replacement = needle + '  ensureTelegramPlatformEnabled(agentId);\n'
if replacement not in text:
    text = text.replace(needle, replacement, 1)

path.write_text(text)
PY
  fi

  if [[ -x "$HERMES_ROOT/node/bin/node" ]]; then
    node_cmd="$HERMES_ROOT/node/bin/node"
  elif command -v node >/dev/null 2>&1; then
    node_cmd="$(command -v node)"
  else
    return 1
  fi

  port="$(choose_web_shell_port)"
  url="${WEB_SHELL_PUBLIC_URL:-http://$WEB_SHELL_HOST:$port}"
  api_url="http://$WEB_SHELL_HOST:$port"
  /bin/mkdir -p "$INSTALL_ROOT/workspace" "$INSTALL_ROOT/obsidian-vault" "$HOME/.hermes-workspaces"
  printf "%s\n" "$url" > "$INSTALL_ROOT/web-shell.url"

  label="com.infobiz.agents.web-shell"
  uid="$(/usr/bin/id -u)"
  plist="$HOME/Library/LaunchAgents/$label.plist"
  /bin/mkdir -p "$HOME/Library/LaunchAgents"
  /bin/launchctl bootout "gui/$uid" "$plist" >/dev/null 2>&1 || true
  /bin/launchctl remove "$label" >/dev/null 2>&1 || true

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_cmd</string>
    <string>$WEB_SHELL_ROOT/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$WEB_SHELL_ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>$port</string>
    <key>HOST</key>
    <string>$WEB_SHELL_HOST</string>
    <key>HERMES_ROOT</key>
    <string>$HERMES_ROOT</string>
    <key>HERMES_AGENT_ROOT</key>
    <string>$HERMES_AGENT_ROOT</string>
    <key>HERMES_PYTHON</key>
    <string>$HERMES_AGENT_ROOT/venv/bin/python</string>
    <key>HERMES_WORKSPACES_ROOT</key>
    <string>$HOME/.hermes-workspaces</string>
    <key>AGENT_WORKSPACE</key>
    <string>$INSTALL_ROOT/workspace</string>
    <key>OBSIDIAN_VAULT</key>
    <string>$INSTALL_ROOT/obsidian-vault</string>
    <key>AGENT_PROFILE_ALLOW</key>
    <string>$AGENT_PROFILE_ALLOW</string>
    <key>WEB_SHELL_API_URL</key>
    <string>$api_url</string>
    <key>PATH</key>
    <string>$SHIM_DIR:$HERMES_ROOT/node/bin:$HERMES_AGENT_ROOT/venv/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$INSTALL_ROOT/web-shell.out.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_ROOT/web-shell.err.log</string>
</dict>
</plist>
PLIST

  /bin/launchctl bootstrap "gui/$uid" "$plist" >/dev/null 2>&1 || /bin/launchctl load "$plist" >/dev/null 2>&1 || return 1
  /bin/launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1 || true
  if [[ -x /usr/bin/open && "${INFOBIZ_OPEN_WEB_PANEL:-1}" = "1" ]]; then
    /usr/bin/open "$url" >/dev/null 2>&1 || true
  fi
  printf "%s" "$url"
}

install_web_shell_launcher() {
  local app_parent app_path executable info_plist
  app_parent="/Applications"
  if ! /bin/mkdir -p "$app_parent" >/dev/null 2>&1 || [[ ! -w "$app_parent" ]]; then
    app_parent="$HOME/Applications"
    /bin/mkdir -p "$app_parent"
  fi

  app_path="$app_parent/Infobiz Agents.app"
  executable="$app_path/Contents/MacOS/open-web-panel"
  info_plist="$app_path/Contents/Info.plist"

  /bin/rm -rf "$app_path"
  /bin/mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"

  cat > "$info_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Infobiz Agents</string>
  <key>CFBundleExecutable</key>
  <string>open-web-panel</string>
  <key>CFBundleIdentifier</key>
  <string>com.infobiz.agents.launcher</string>
  <key>CFBundleName</key>
  <string>Infobiz Agents</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
PLIST

  cat > "$executable" <<'APP'
#!/bin/zsh
set -euo pipefail

url_file="$HOME/InfobizAgents/web-shell.url"
label="com.infobiz.agents.web-shell"

if [[ -f "$url_file" ]]; then
  url="$(/usr/bin/head -n 1 "$url_file")"
else
  url="http://127.0.0.1:8787"
fi

uid="$(/usr/bin/id -u)"
/bin/launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1 || true
/usr/bin/open "$url"
APP

  /bin/chmod +x "$executable"
  /usr/bin/xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true
  /usr/bin/xattr -dr com.apple.provenance "$app_path" >/dev/null 2>&1 || true
  printf "%s" "$app_path"
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
install_command_shims
trap cleanup EXIT

say "Installing Hermes from official repository"
if [[ -d "$HERMES_ROOT" ]]; then
  backup="$HOME/.hermes.backup.$(/bin/date +%Y%m%d%H%M%S)"
  /bin/mv "$HERMES_ROOT" "$backup"
  printf "Existing ~/.hermes moved to %s\n" "$backup"
fi
/bin/mkdir -p "$HERMES_ROOT"
ensure_uv || fail "Could not install uv"
install_node_runtime || fail "Could not install Node.js runtime"
install_hermes_from_source || fail "Official Hermes setup failed"

[[ -x "$HERMES_CMD" ]] || fail "Hermes command not found: $HERMES_CMD"

say "Installing agent profiles: $AGENT_NAME"
profile_payload="$(need_profile_payload)"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-profile.XXXXXX")"
CLEANUP_WORKDIR="$workdir"
run_logged "Extracting agent profiles" /usr/bin/tar -xzf "$profile_payload" -C "$workdir" || fail "Could not extract agent profiles"
install_profiles_and_skills "$profile_payload" "$workdir"

say "OpenAI/Hermes authorization"
printf "The installer will open the authorization page and copy the code when Hermes prints it.\n"
run_hermes_auth || fail "OpenAI/Hermes authorization failed"

say "Installing Hermes gateway services"
run_hermes gateway install --force >> "$LOG_FILE" 2>&1 || true
for profile in "${(@s:,:)AGENT_PROFILES}"; do
  profile="$(printf "%s" "$profile" | /usr/bin/xargs)"
  [[ -n "$profile" ]] || continue
  run_hermes -p "$profile" gateway install --force >> "$LOG_FILE" 2>&1 || true
done

say "Starting Hermes gateways"
run_hermes gateway start >> "$LOG_FILE" 2>&1 || true
for profile in "${(@s:,:)AGENT_PROFILES}"; do
  profile="$(printf "%s" "$profile" | /usr/bin/xargs)"
  [[ -n "$profile" ]] || continue
  run_hermes -p "$profile" gateway start >> "$LOG_FILE" 2>&1 || true
done

say "Installing local web panel"
web_shell_url="$(install_web_shell)" || fail "Could not install local web panel"

say "Creating Applications shortcut"
web_shell_app="$(install_web_shell_launcher)" || fail "Could not create web panel shortcut"

say "Done"
printf "Installed %s. Open the web panel to configure Telegram and use the agent:\n" "$AGENT_NAME"
printf "%s\n" "$web_shell_url"
printf "Shortcut: %s\n" "$web_shell_app"
printf "Log file: %s\n" "$LOG_FILE"
