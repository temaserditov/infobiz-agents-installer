#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
HERMES_CMD="$HERMES_AGENT_ROOT/venv/bin/hermes"
MARKETER_ROOT="$HERMES_ROOT/profiles/marketer"
COPYWRITER_ROOT="$HERMES_ROOT/profiles/copywriter"
DESIGNER_ROOT="$HERMES_ROOT/profiles/designer"
TECH_ROOT="$HERMES_ROOT/profiles/tech"
WEB_SHELL_ROOT="$INSTALL_ROOT/web-shell"
LOG_FILE="$INSTALL_ROOT/update.log"
VERSION="${VERSION:-0.1.0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v$VERSION}"
WEB_SHELL_URL="${WEB_SHELL_URL:-$BASE_URL/agent-web-shell-$VERSION.tar.gz}"
PROFILE_URL="${PROFILE_URL:-$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
HERMES_IMAGE_REFERENCE_PATCH_URL="${HERMES_IMAGE_REFERENCE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-image-reference.py}"
HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL="${HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-telegram-text-photo-merge.py}"
HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL="${HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-local-media-markdown.py}"
HERMES_RUNTIME_SAFETY_PATCH_URL="${HERMES_RUNTIME_SAFETY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-codex-runtime-safety.py}"
HERMES_TELEGRAM_RELIABILITY_PATCH_URL="${HERMES_TELEGRAM_RELIABILITY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-telegram-reliability.py}"
HERMES_SESSION_HISTORY_REPAIR_URL="${HERMES_SESSION_HISTORY_REPAIR_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/repair-hermes-session-history.py}"
AGENT_RUSSIAN_ONLY_PATCH_URL="${AGENT_RUSSIAN_ONLY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-agent-russian-only.py}"
TECH_NO_CODE_PATCH_URL="${TECH_NO_CODE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-tech-no-code-defaults.py}"
HERMES_SOURCE_URL="${HERMES_SOURCE_URL:-}"
HERMES_RELEASE_API="${HERMES_RELEASE_API:-https://api.github.com/repos/NousResearch/hermes-agent/releases/latest}"
HERMES_FALLBACK_TAG="${HERMES_FALLBACK_TAG:-v2026.7.7.2}"
UPDATE_HERMES_RUNTIME="${UPDATE_HERMES_RUNTIME:-1}"
GATEWAYS_STOPPED=0
RUNTIME_SWAP_BACKUP=""
WEB_SHELL_PORT="${WEB_SHELL_PORT:-8787}"
WEB_SHELL_HOST_EXPLICIT="${WEB_SHELL_HOST+x}"
WEB_SHELL_HOST="${WEB_SHELL_HOST:-0.0.0.0}"
AGENT_PROFILE_ALLOW="${AGENT_PROFILE_ALLOW:-default,marketer,copywriter,designer,tech}"
SYSTEMD_UNIT_DIR="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
STUDENT_UI="${STUDENT_UI:-0}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-10}"
CURL_MAX_TIME="${CURL_MAX_TIME:-180}"
UPDATE_PROGRESS_STEP=0
UPDATE_PROGRESS_TOTAL=16
UPDATE_PROGRESS_START="${UPDATE_PROGRESS_START:-0}"
UPDATE_PROGRESS_END="${UPDATE_PROGRESS_END:-100}"

render_update_progress() {
  [[ "$STUDENT_UI" == "1" ]] || return 0
  local label="$1"
  local percent=$((UPDATE_PROGRESS_START + UPDATE_PROGRESS_STEP * (UPDATE_PROGRESS_END - UPDATE_PROGRESS_START) / UPDATE_PROGRESS_TOTAL))
  local width=42
  local filled=$((percent * width / 100))
  local empty=$((width - filled))
  local bar spaces
  bar="$(printf '%*s' "$filled" '' | tr ' ' '#')"
  spaces="$(printf '%*s' "$empty" '')"
  printf "\033[2J\033[H"
  printf "Обновление агентов\n\n"
  printf "%s\n\n" "$label"
  printf "[\033[32m%s\033[0m%s] %s%%\n" "$bar" "$spaces" "$percent"
  printf "\nНе закрывайте терминал. Сетевые загрузки ограничены по времени и повторяются автоматически.\n"
}

update_stage() {
  local label="$1"
  if (( UPDATE_PROGRESS_STEP < UPDATE_PROGRESS_TOTAL )); then
    UPDATE_PROGRESS_STEP=$((UPDATE_PROGRESS_STEP + 1))
  fi
  render_update_progress "$label"
}

say() {
  if [[ "$STUDENT_UI" == "1" ]]; then
    update_stage "$1"
    printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
  else
    printf "==> %s\n" "$1"
  fi
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

download_file() {
  local url="$1"
  local output="$2"
  printf "Downloading: %s\n" "${url%%\?*}" >> "$LOG_FILE"
  curl -fsSL \
    --connect-timeout "$CURL_CONNECT_TIMEOUT" \
    --max-time "$CURL_MAX_TIME" \
    --retry 2 \
    --retry-delay 2 \
    --retry-all-errors \
    "$url" -o "$output" >> "$LOG_FILE" 2>&1
}

acquire_install_lock() {
  [[ "${INFOBIZ_INSTALL_LOCK_HELD:-0}" == "1" ]] && return 0
  command -v flock >/dev/null 2>&1 \
    || fail "flock is unavailable; use Ubuntu 22.04/24.04 or Debian 11+"
  exec 9>"$INSTALL_ROOT/.install.lock"
  flock -n 9 \
    || fail "Another Infobiz Agents install or update is already running on this VPS"
}

patch_official_hermes_setup_at() {
  local setup_path="$1/setup-hermes.sh"
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

restart_vps_services_after_rollback() {
  command -v systemctl >/dev/null 2>&1 || return 0
  systemctl start infobiz-hermes-gateway.service >/dev/null 2>&1 || true
  systemctl start infobiz-hermes-gateway-marketer.service >/dev/null 2>&1 || true
  systemctl start infobiz-hermes-gateway-copywriter.service >/dev/null 2>&1 || true
  systemctl start infobiz-hermes-gateway-designer.service >/dev/null 2>&1 || true
  systemctl start infobiz-hermes-gateway-tech.service >/dev/null 2>&1 || true
  GATEWAYS_STOPPED=0
}

restore_runtime_backup_if_needed() {
  [[ -n "$RUNTIME_SWAP_BACKUP" ]] || return 0
  [[ -d "$RUNTIME_SWAP_BACKUP/hermes-agent" ]] || return 1
  rm -rf "$HERMES_AGENT_ROOT"
  mv "$RUNTIME_SWAP_BACKUP/hermes-agent" "$HERMES_AGENT_ROOT" || return 1
  RUNTIME_SWAP_BACKUP=""
}

cleanup_update() {
  local exit_code=$?
  trap - EXIT
  if [[ "$GATEWAYS_STOPPED" == "1" ]]; then
    if ! restore_runtime_backup_if_needed; then
      printf "Could not restore the previous Hermes runtime from %s\n" "$RUNTIME_SWAP_BACKUP" >> "$LOG_FILE"
    fi
    printf "Update interrupted after gateways were stopped; starting them again.\n" >> "$LOG_FILE"
    restart_vps_services_after_rollback || true
  fi
  exit "$exit_code"
}
trap cleanup_update EXIT

refresh_official_hermes_runtime() {
  [[ "$UPDATE_HERMES_RUNTIME" == "1" ]] || return 0
  local workdir metadata tag tarball_url source_tarball staged backup current_ref
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-hermes-update.XXXXXX")" || return 1
  source_tarball="$workdir/hermes.tar.gz"
  staged="$workdir/hermes-agent"
  current_ref="$(cat "$HERMES_AGENT_ROOT/.infobiz-upstream-ref" 2>/dev/null || true)"
  metadata="$(curl -fsSL --max-time 20 "$HERMES_RELEASE_API" 2>> "$LOG_FILE" || true)"
  tag="$(printf "%s" "$metadata" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -1)"
  tarball_url="$(printf "%s" "$metadata" | sed -nE 's/.*"tarball_url"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -1)"
  if [[ -n "$HERMES_SOURCE_URL" ]]; then
    tarball_url="$HERMES_SOURCE_URL"
    tag="custom"
  elif [[ -z "$tarball_url" ]]; then
    if [[ "$current_ref" == release:* ]]; then
      printf "Hermes release API unavailable; keeping installed %s\n" "$current_ref" >> "$LOG_FILE"
      rm -rf "$workdir"
      return 0
    fi
    tag="$HERMES_FALLBACK_TAG"
    tarball_url="https://github.com/NousResearch/hermes-agent/archive/refs/tags/$tag.tar.gz"
  fi

  if [[ "$current_ref" == "release:$tag" ]]; then
    printf "Hermes runtime already current: %s\n" "$tag" >> "$LOG_FILE"
    rm -rf "$workdir"
    return 0
  fi

  if ! download_file "$tarball_url" "$source_tarball"; then rm -rf "$workdir"; return 1; fi
  mkdir -p "$staged"
  if ! tar --strip-components=1 -xzf "$source_tarball" -C "$staged"; then rm -rf "$workdir"; return 1; fi
  if [[ ! -f "$staged/pyproject.toml" || ! -f "$staged/setup-hermes.sh" ]]; then rm -rf "$workdir"; return 1; fi
  if ! patch_official_hermes_setup_at "$staged"; then rm -rf "$workdir"; return 1; fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop infobiz-hermes-gateway.service >/dev/null 2>&1 || true
    systemctl stop infobiz-hermes-gateway-marketer.service >/dev/null 2>&1 || true
    systemctl stop infobiz-hermes-gateway-copywriter.service >/dev/null 2>&1 || true
    systemctl stop infobiz-hermes-gateway-designer.service >/dev/null 2>&1 || true
    systemctl stop infobiz-hermes-gateway-tech.service >/dev/null 2>&1 || true
    GATEWAYS_STOPPED=1
  fi

  backup="$HERMES_ROOT/.archives/hermes-runtime.$(date +%Y%m%d%H%M%S)"
  mkdir -p "$backup"
  if ! mv "$HERMES_AGENT_ROOT" "$backup/hermes-agent"; then
    rm -rf "$workdir"
    return 1
  fi
  RUNTIME_SWAP_BACKUP="$backup"
  if ! mv "$staged" "$HERMES_AGENT_ROOT"; then
    restore_runtime_backup_if_needed || true
    restart_vps_services_after_rollback
    rm -rf "$workdir"
    return 1
  fi
  if ! (
    cd "$HERMES_AGENT_ROOT" && HERMES_HOME="$HERMES_ROOT" bash ./setup-hermes.sh
  ) >> "$LOG_FILE" 2>&1; then
    rm -rf "$HERMES_AGENT_ROOT"
    restore_runtime_backup_if_needed || true
    restart_vps_services_after_rollback
    rm -rf "$workdir"
    return 1
  fi
  if ! "$HERMES_AGENT_ROOT/venv/bin/python" -c "import telegram, aiohttp, qrcode" >> "$LOG_FILE" 2>&1; then
    rm -rf "$HERMES_AGENT_ROOT"
    restore_runtime_backup_if_needed || true
    restart_vps_services_after_rollback
    rm -rf "$workdir"
    return 1
  fi
  if ! printf "managed-runtime\n" > "$HERMES_AGENT_ROOT/.install_method" \
    || ! printf "release:%s\n" "$tag" > "$HERMES_AGENT_ROOT/.infobiz-upstream-ref" \
    || ! mkdir -p "$HOME/.local/bin" \
    || ! ln -sf "$HERMES_CMD" "$HOME/.local/bin/hermes"; then
    restore_runtime_backup_if_needed || true
    restart_vps_services_after_rollback
    rm -rf "$workdir"
    return 1
  fi
  RUNTIME_SWAP_BACKUP=""
  find "$HERMES_ROOT/.archives" -maxdepth 1 -type d -name 'hermes-runtime.*' -print \
    | sort -r | tail -n +3 \
    | while IFS= read -r old_backup; do [[ -n "$old_backup" ]] && rm -rf "$old_backup"; done
  rm -rf "$workdir"
}

patch_markdown_file() {
  local file="$1"
  local title="$2"
  mkdir -p "$(dirname "$file")"
  "$HERMES_AGENT_ROOT/venv/bin/python" - "$file" "$title" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
title = sys.argv[2]
text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else f"# {title}\n"

start = "<!-- INFOBIZ_GPT_IMAGE_2_HIGH_PATCH_START -->"
end = "<!-- INFOBIZ_GPT_IMAGE_2_HIGH_PATCH_END -->"
block = f"""{start}

## Infobiz image generation patch

This section is an installer patch. It has priority for image-generation requests.

- If the user asks to generate/create/make/draw an image, cover, banner, creative, illustration, or visual, generate the actual image.
- Do not answer with only a prompt unless the user explicitly asks for a prompt or image generation is technically unavailable.
- Use GPT-Image 2 High through the authorized Hermes/OpenAI-Codex image provider.
- Do not ask for an API key.
- Do not use OpenAI API, FAL API, Lao Zhang, or a third-party provider unless the user explicitly asks for that route.
- Do not create the requested image manually with Python, Pillow, HTML, CSS, canvas, SVG, screenshots, or any local drawing/compositing method.
- Do not generate a background and then overlay text/elements manually with code.
- If text, labels, badges, arrows, UI fragments, or other elements must appear in the image, include them in the GPT-Image 2 prompt itself.
- Local code may only help with file handling: downloading, saving, converting, or sending the generated image. It must not draw, compose, typeset, or decorate the requested image.
- In Telegram, send the generated result as a native image, not as a textual link.
- After the image tool returns a local generated file, include a standalone line exactly in this format: `MEDIA:/absolute/path/to/generated-image.png`.
- Do not wrap `MEDIA:` in prose, Markdown links, bullets, or code fences. The `MEDIA:` line must be alone so Telegram uploads the image as a photo.
- If the image tool returns only a remote image URL, include it as a Markdown image (`![result](https://...)`), not as a plain clickable link.

Image-task trigger contract:

- Treat these words and their Russian equivalents as image tasks: image, photo, visual, banner, cover, creative, illustration, generate, create, make, draw, edit, change, add, extend, outpaint, inpaint, картинка, изображение, фото, баннер, обложка, креатив, сгенерируй, сделай, нарисуй, измени, добавь, дорисуй, расширь, замени фон, переодень.
- If the current Telegram/web message contains a source image plus an edit/generation instruction, the first assistant action after understanding the task must be `image_generate` with `image_url`. Do not answer with analysis first.
- Do not say "I can only make a prompt", "I cannot preserve the face", "use a mask", or similar caveats before trying the available image tool. Try the reference-image generation route first.
- Do not ask whether to use GPT-Image 2. The route is fixed: GPT-Image 2 High through the authorized OpenAI-Codex provider.
- If the user sends several photos in Telegram and then gives an edit instruction, use the main source as `image_url` and any additional references as `reference_image_urls`.
- If the user sends only a photo without a task, ask one short clarification. If the user sends a task, generate/edit immediately.
- Do not produce a final text-only answer for an image task unless the image tool fails.

Reference-photo/person edit contract:

- If the user attaches a source photo/image of a person and asks to keep the face, preserve identity, extend the body, change clothes, change the background, make full-height, or edit only part of the image, treat the original person as a locked identity reference.
- If the user says this is their face or their agent must use their face in creatives, help with that exact task. Do not moralize, argue, refuse, or redirect to a generic model/person.
- For these tasks, always call `image_generate` with `image_url` set to the local source image path/url. Do not use plain text-only generation.
- Preserve the exact same face, head shape, haircut, hairline, ears, neck, skin tone, expression, gaze, and visible identity features from the source image.
- Do not replace the head or face with another person.
- Do not generate a similar-looking model from a text description.
- Do not crop away the original face to hide a mismatch.
- Use GPT-Image 2 High in image edit / image-to-image / inpaint / outpaint / reference-preserving mode when available.
- The tool call must include the source image as `image_url`; a prompt that merely describes the source face is not enough.
- The internal prompt must say: "Preserve the original face, head, hair, neck, expression, and identity exactly from the provided source image. Do not replace the person. Edit/extend only the requested non-identity areas."
- For outpaint/body-extension requests, preserve the original head/face pixels as the anchor and extend only canvas/body/clothes/background unless the user explicitly asks to change identity features.
- Do not write "I generated it with face preservation in the prompt"; that means you used the wrong route. Correct wording: "Generated by editing the source image with image_url."
- If the generated result changes the face/head, treat it as a failed draft. Regenerate with stronger identity-lock instructions and the original image as reference/input. Do not send a changed-identity result as final.
- Only ask the user for a better source image or mask if repeated attempts are likely to keep changing the identity.

Correct behavior: generate via `image_generate`, send the image, then add a short caption and 1-3 iteration options.

Fallback only if generation is unavailable: clearly say the image tool is not available and provide a temporary GPT-Image 2 prompt.

{end}"""

pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
if pattern.search(text):
    text = pattern.sub(block, text)
else:
    text = text.rstrip() + "\n\n" + block + "\n"
path.write_text(text, encoding="utf-8")
PY
}

configure_designer_image_generation() {
  local config_path="$DESIGNER_ROOT/config.yaml"
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

download_and_run_python_patch() {
  local url="$1" patcher patch_status
  shift
  patcher="$(mktemp "${TMPDIR:-/tmp}/infobiz-patch.XXXXXX")" || return 1
  if download_file "$url" "$patcher"; then
    if "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$@"; then patch_status=0; else patch_status=$?; fi
  else
    patch_status=$?
  fi
  rm -f "$patcher"
  return "$patch_status"
}

patch_hermes_image_reference_support() {
  download_and_run_python_patch "$HERMES_IMAGE_REFERENCE_PATCH_URL" "$HERMES_AGENT_ROOT"
}

patch_telegram_text_photo_merge_support() {
  download_and_run_python_patch "$HERMES_TELEGRAM_TEXT_PHOTO_MERGE_PATCH_URL" "$HERMES_AGENT_ROOT"
}

patch_hermes_local_media_markdown_support() {
  download_and_run_python_patch "$HERMES_LOCAL_MEDIA_MARKDOWN_PATCH_URL" "$HERMES_AGENT_ROOT"
}

patch_hermes_codex_runtime_safety() {
  download_and_run_python_patch "$HERMES_RUNTIME_SAFETY_PATCH_URL" \
    --hermes-root "$HERMES_ROOT" \
    --hermes-agent-root "$HERMES_AGENT_ROOT" \
    --profiles "marketer,copywriter,designer,tech"
}

patch_hermes_telegram_reliability() {
  download_and_run_python_patch "$HERMES_TELEGRAM_RELIABILITY_PATCH_URL" "$HERMES_AGENT_ROOT"
}

repair_hermes_session_history() {
  download_and_run_python_patch "$HERMES_SESSION_HISTORY_REPAIR_URL" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "default,marketer,copywriter,designer,tech" \
    --apply
}

stop_gateways_for_maintenance() {
  if command -v systemctl >/dev/null 2>&1; then
    local service
    for service in \
      infobiz-hermes-gateway.service \
      infobiz-hermes-gateway-marketer.service \
      infobiz-hermes-gateway-copywriter.service \
      infobiz-hermes-gateway-designer.service \
      infobiz-hermes-gateway-tech.service
    do
      systemctl stop "$service" >/dev/null 2>&1 || true
    done
    GATEWAYS_STOPPED=1
  fi
}

patch_agents_russian_only() {
  download_and_run_python_patch "$AGENT_RUSSIAN_ONLY_PATCH_URL" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "marketer,copywriter,designer,tech"
}

patch_tech_no_code_defaults() {
  download_and_run_python_patch "$TECH_NO_CODE_PATCH_URL" "$TECH_ROOT"
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

update_web_shell() {
  local workdir payload
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-web-shell.XXXXXX")" || return 1
  payload="$workdir/agent-web-shell.tar.gz"
  if ! download_file "$WEB_SHELL_URL" "$payload" \
    || ! tar -xzf "$payload" -C "$workdir" \
    || [[ ! -d "$workdir/web-shell/public" || ! -d "$workdir/web-shell/scripts" ]]; then
    rm -rf "$workdir"
    return 1
  fi
  mkdir -p "$WEB_SHELL_ROOT" || { rm -rf "$workdir"; return 1; }
  cp -a "$workdir/web-shell/public" "$WEB_SHELL_ROOT/" \
    || { rm -rf "$workdir"; return 1; }
  cp -a "$workdir/web-shell/scripts" "$WEB_SHELL_ROOT/" \
    || { rm -rf "$workdir"; return 1; }
  for file in server.mjs runner.py package.json README.md; do
    if [[ -f "$workdir/web-shell/$file" ]]; then
      cp "$workdir/web-shell/$file" "$WEB_SHELL_ROOT/$file" \
        || { rm -rf "$workdir"; return 1; }
    fi
  done
  rm -rf "$workdir"
}

profile_root_for() {
  case "$1" in
    marketer) printf "%s" "$MARKETER_ROOT" ;;
    copywriter) printf "%s" "$COPYWRITER_ROOT" ;;
    designer) printf "%s" "$DESIGNER_ROOT" ;;
    tech) printf "%s" "$TECH_ROOT" ;;
    *) return 1 ;;
  esac
}

backup_profile() {
  local profile="$1"
  local profile_root="$2"
  local backup_dir="$HERMES_ROOT/.archives/$profile-update.$(date +%Y%m%d%H%M%S)"
  mkdir -p "$backup_dir" || return 1
  if [[ -d "$profile_root" ]]; then
    cp -a "$profile_root" "$backup_dir/profile" || return 1
  fi
  printf "Backed up %s to %s\n" "$profile" "$backup_dir"
  find "$HERMES_ROOT/.archives" -maxdepth 1 -type d -name "$profile-update.*" -print \
    | sort -r | tail -n +4 \
    | while IFS= read -r old_backup; do [[ -n "$old_backup" ]] && rm -rf "$old_backup"; done
}

update_profile_from_payload() {
  local profile="$1"
  local source_dir="$2"
  local profile_root skill_dir skill_name
  profile_root="$(profile_root_for "$profile")" || return 1
  [[ -d "$source_dir" ]] || return 1
  mkdir -p "$profile_root" || return 1
  backup_profile "$profile" "$profile_root" || return 1
  rsync -a \
    --exclude '.env' \
    --exclude 'auth.json' \
    --exclude 'config.yaml' \
    --exclude 'sessions/' \
    --exclude 'logs/' \
    --exclude 'memories/' \
    --exclude 'home/' \
    --exclude 'workspace/' \
    --exclude 'plans/' \
    --exclude 'local/' \
    --exclude 'MEMORY.md' \
    --exclude 'USER.md' \
    --exclude 'LEARNING.md' \
    --exclude 'skills/' \
    --exclude 'cache/' \
    --exclude 'cron/' \
    --exclude 'test-runs/' \
    "$source_dir/" "$profile_root/" || return 1
  if [[ -d "$source_dir/skills" ]]; then
    mkdir -p "$profile_root/skills" || return 1
    for skill_dir in "$source_dir"/skills/*; do
      [[ -d "$skill_dir" ]] || continue
      skill_name="$(basename "$skill_dir")"
      rm -rf "$profile_root/skills/$skill_name" || return 1
      rsync -a "$skill_dir/" "$profile_root/skills/$skill_name/" || return 1
    done
  fi
  enable_profile_telegram_platform "$profile_root" || return 1
  disable_profile_kanban_dispatch "$profile_root" || return 1
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

update_agent_profiles() {
  local workdir payload profile source_dir
  workdir="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-profile.XXXXXX")" || return 1
  payload="$workdir/profile.tar.gz"
  download_file "$PROFILE_URL" "$payload" || { rm -rf "$workdir"; return 1; }
  tar -xzf "$payload" -C "$workdir" || { rm -rf "$workdir"; return 1; }
  [[ -d "$workdir/profile/agents" ]] || { rm -rf "$workdir"; return 1; }
  validate_profile_payload "$workdir/profile" || { rm -rf "$workdir"; return 1; }
  for profile in marketer copywriter designer tech; do
    source_dir="$workdir/profile/agents/$profile"
    update_profile_from_payload "$profile" "$source_dir" || { rm -rf "$workdir"; return 1; }
  done
  if [[ -f "$workdir/profile/default/SOUL.md" ]]; then
    cp "$workdir/profile/default/SOUL.md" "$HERMES_ROOT/SOUL.md" || { rm -rf "$workdir"; return 1; }
  fi
  if [[ -d "$workdir/profile/skills/webshell-docs" ]]; then
    rm -rf "$HERMES_ROOT/skills/webshell-docs" || { rm -rf "$workdir"; return 1; }
    rsync -a "$workdir/profile/skills/webshell-docs/" "$HERMES_ROOT/skills/webshell-docs/" \
      || { rm -rf "$workdir"; return 1; }
  fi
  rm -rf "$workdir"
}

ensure_vps_services() {
  local node_cmd token profile service profile_home existing_port existing_host env_tmp
  local -a services=(infobiz-web-shell.service)
  node_cmd="$HERMES_ROOT/node/bin/node"
  [[ -x "$node_cmd" ]] || node_cmd="$(command -v node 2>/dev/null || true)"
  [[ -x "$node_cmd" ]] || return 1
  mkdir -p "$INSTALL_ROOT/workspace" "$INSTALL_ROOT/obsidian-vault" "$HOME/.hermes-workspaces" || return 1
  if [[ -f "$INSTALL_ROOT/vps.env" ]]; then
    existing_port="$(sed -n "s/^WEB_SHELL_PORT=['\"]\{0,1\}\([0-9][0-9]*\).*/\1/p" "$INSTALL_ROOT/vps.env" | tail -1)"
    [[ -n "$existing_port" ]] && WEB_SHELL_PORT="$existing_port"
    env_tmp="$(mktemp "${TMPDIR:-/tmp}/infobiz-vps-env.XXXXXX")" || return 1
    awk -v allow="$AGENT_PROFILE_ALLOW" '
      BEGIN { written = 0 }
      /^AGENT_PROFILE_ALLOW=/ {
        print "AGENT_PROFILE_ALLOW=\047" allow "\047"
        written = 1
        next
      }
      { print }
      END {
        if (!written) print "AGENT_PROFILE_ALLOW=\047" allow "\047"
      }
    ' "$INSTALL_ROOT/vps.env" > "$env_tmp" || { rm -f "$env_tmp"; return 1; }
    mv "$env_tmp" "$INSTALL_ROOT/vps.env" || { rm -f "$env_tmp"; return 1; }
    chmod 600 "$INSTALL_ROOT/vps.env" || return 1
  fi
  if [[ ! -f "$INSTALL_ROOT/vps.env" ]]; then
    token="$(openssl rand -hex 24)" || return 1
    cat > "$INSTALL_ROOT/vps.env" <<ENV
WEB_SHELL_ACCESS_TOKEN='$token'
WEB_SHELL_PORT='$WEB_SHELL_PORT'
AGENT_PROFILE_ALLOW='$AGENT_PROFILE_ALLOW'
ENV
    chmod 600 "$INSTALL_ROOT/vps.env" || return 1
  fi

  if [[ -z "$WEB_SHELL_HOST_EXPLICIT" && -f "$SYSTEMD_UNIT_DIR/infobiz-web-shell.service" ]]; then
    existing_host="$(sed -n 's/^Environment=HOST=//p' "$SYSTEMD_UNIT_DIR/infobiz-web-shell.service" | tail -1)"
    if [[ "$existing_host" == "127.0.0.1" || "$existing_host" == "0.0.0.0" || "$existing_host" == "::1" ]]; then
      WEB_SHELL_HOST="$existing_host"
    fi
  fi

  mkdir -p "$SYSTEMD_UNIT_DIR" || return 1
  cat > "$SYSTEMD_UNIT_DIR/infobiz-web-shell.service" <<SERVICE
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

  systemctl disable infobiz-hermes-gateway-producer.service >/dev/null 2>&1 || true
  rm -f "$SYSTEMD_UNIT_DIR/infobiz-hermes-gateway-producer.service"
  for profile in default marketer copywriter designer tech; do
    if [[ "$profile" == "default" ]]; then
      service="infobiz-hermes-gateway.service"
      profile_home="$HERMES_ROOT"
    else
      [[ -d "$HERMES_ROOT/profiles/$profile" ]] || continue
      service="infobiz-hermes-gateway-$profile.service"
      profile_home="$HERMES_ROOT/profiles/$profile"
    fi
    cat > "$SYSTEMD_UNIT_DIR/$service" <<SERVICE
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
    services+=("$service")
  done
  systemctl daemon-reload || return 1
  for service in "${services[@]}"; do
    systemctl enable "$service" >/dev/null 2>&1 || return 1
  done
}

[[ "$(uname -s)" == "Linux" ]] || fail "This updater supports Linux VPS only."
[[ -d "$HERMES_AGENT_ROOT" ]] || fail "Hermes is not installed. Run the full installer first."
[[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || fail "Hermes Python venv is missing. Run the full installer first."

mkdir -p "$INSTALL_ROOT"
acquire_install_lock
: > "$LOG_FILE"

say "Updating official Hermes runtime"
refresh_official_hermes_runtime >> "$LOG_FILE" 2>&1 || fail "Could not update official Hermes runtime"

say "Updating agent profiles"
update_agent_profiles

say "Patching Hermes image reference support"
patch_hermes_image_reference_support

say "Patching Telegram text/photo merge"
patch_telegram_text_photo_merge_support

say "Patching local media Markdown delivery"
patch_hermes_local_media_markdown_support

say "Patching designer image generation rules"
patch_markdown_file "$DESIGNER_ROOT/SOUL.md" "SOUL.md"
patch_markdown_file "$DESIGNER_ROOT/IMAGE_GENERATION_POLICY.md" "IMAGE_GENERATION_POLICY.md"
patch_markdown_file "$DESIGNER_ROOT/skills/gpt-image-2-generation-basic/SKILL.md" "gpt-image-2-generation-basic"

say "Patching tech no-code defaults"
patch_tech_no_code_defaults

say "Updating WebShell"
update_web_shell

say "Configuring GPT-Image 2 High"
configure_designer_image_generation

say "Patching Russian-only language rule"
patch_agents_russian_only

say "Patching Hermes Codex runtime safety"
patch_hermes_codex_runtime_safety

say "Patching Telegram delivery reliability"
patch_hermes_telegram_reliability

say "Repairing incomplete session history"
stop_gateways_for_maintenance
repair_hermes_session_history

say "Repairing service definitions"
ensure_vps_services

say "Restarting gateways"
if command -v systemctl >/dev/null 2>&1; then
  for service in \
    infobiz-hermes-gateway.service \
    infobiz-hermes-gateway-marketer.service \
    infobiz-hermes-gateway-copywriter.service \
    infobiz-hermes-gateway-designer.service \
    infobiz-hermes-gateway-tech.service \
    infobiz-web-shell.service
  do
    systemctl restart "$service" >/dev/null 2>&1 || fail "Could not restart $service"
    systemctl is-active --quiet "$service" || fail "$service is not active after update"
  done
  GATEWAYS_STOPPED=0
fi

say "Patch complete"
if [[ "$STUDENT_UI" == "1" ]]; then
  printf "\nОбновление завершено.\n"
fi
