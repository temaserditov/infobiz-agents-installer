#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$HOME/.cargo/bin"

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
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
HERMES_RUNTIME_SAFETY_PATCH_URL="${HERMES_RUNTIME_SAFETY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-hermes-codex-runtime-safety.py}"
AGENT_RUSSIAN_ONLY_PATCH_URL="${AGENT_RUSSIAN_ONLY_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-agent-russian-only.py}"
TECH_NO_CODE_PATCH_URL="${TECH_NO_CODE_PATCH_URL:-https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/scripts/patch-tech-no-code-defaults.py}"

say() {
  printf "==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  printf "Log file: %s\n" "$LOG_FILE" >&2
  exit 1
}

patch_markdown_file() {
  local file="$1"
  local title="$2"
  /bin/mkdir -p "$(/usr/bin/dirname "$file")"
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
- In Telegram, send the generated result as a native image when possible: image URL or `MEDIA:/absolute/path`.

Image-task trigger contract:

- Treat these words and their Russian equivalents as image tasks: image, photo, visual, banner, cover, creative, illustration, generate, create, make, draw, edit, change, add, extend, outpaint, inpaint, картинка, изображение, фото, баннер, обложка, креатив, сгенерируй, сделай, нарисуй, измени, добавь, дорисуй, расширь, замени фон, переодень.
- If the current Telegram/web message contains a source image plus an edit/generation instruction, the first assistant action after understanding the task must be `image_generate` with `reference_image`. Do not answer with analysis first.
- Do not say "I can only make a prompt", "I cannot preserve the face", "use a mask", or similar caveats before trying the available image tool. Try the reference-image generation route first.
- Do not ask whether to use GPT-Image 2. The route is fixed: GPT-Image 2 High through the authorized OpenAI-Codex provider.
- If the user sends several photos in Telegram and then gives an edit instruction, use the most recent relevant cached local image path as `reference_image`.
- If the user sends only a photo without a task, ask one short clarification. If the user sends a task, generate/edit immediately.
- Do not produce a final text-only answer for an image task unless the image tool fails.

Reference-photo/person edit contract:

- If the user attaches a source photo/image of a person and asks to keep the face, preserve identity, extend the body, change clothes, change the background, make full-height, or edit only part of the image, treat the original person as a locked identity reference.
- If the user says this is their face or their agent must use their face in creatives, help with that exact task. Do not moralize, argue, refuse, or redirect to a generic model/person.
- For these tasks, always call `image_generate` with `reference_image` set to the local source image path/url. Do not use plain text-only generation.
- Preserve the exact same face, head shape, haircut, hairline, ears, neck, skin tone, expression, gaze, and visible identity features from the source image.
- Do not replace the head or face with another person.
- Do not generate a similar-looking model from a text description.
- Do not crop away the original face to hide a mismatch.
- Use GPT-Image 2 High in image edit / image-to-image / inpaint / outpaint / reference-preserving mode when available.
- The tool call must include the source image as `reference_image`; a prompt that merely describes the source face is not enough.
- The internal prompt must say: "Preserve the original face, head, hair, neck, expression, and identity exactly from the provided source image. Do not replace the person. Edit/extend only the requested non-identity areas."
- For outpaint/body-extension requests, preserve the original head/face pixels as the anchor and extend only canvas/body/clothes/background unless the user explicitly asks to change identity features.
- Do not write "I generated it with face preservation in the prompt"; that means you used the wrong route. Correct wording: "Generated by editing the source image with reference_image."
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

patch_hermes_image_reference_support() {
  local patcher="${TMPDIR:-/tmp}/patch-hermes-image-reference.py"
  /usr/bin/curl -fsSL "$HERMES_IMAGE_REFERENCE_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$HERMES_AGENT_ROOT"
}

patch_hermes_codex_runtime_safety() {
  local patcher="${TMPDIR:-/tmp}/patch-hermes-codex-runtime-safety.py"
  /usr/bin/curl -fsSL "$HERMES_RUNTIME_SAFETY_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --hermes-agent-root "$HERMES_AGENT_ROOT" \
    --profiles "marketer,copywriter,designer,tech"
}

patch_agents_russian_only() {
  local patcher="${TMPDIR:-/tmp}/patch-agent-russian-only.py"
  /usr/bin/curl -fsSL "$AGENT_RUSSIAN_ONLY_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" \
    --hermes-root "$HERMES_ROOT" \
    --profiles "marketer,copywriter,designer,tech"
}

patch_tech_no_code_defaults() {
  local patcher="${TMPDIR:-/tmp}/patch-tech-no-code-defaults.py"
  /usr/bin/curl -fsSL "$TECH_NO_CODE_PATCH_URL" -o "$patcher"
  "$HERMES_AGENT_ROOT/venv/bin/python" "$patcher" "$TECH_ROOT"
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
  workdir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/infobiz-web-shell.XXXXXX")"
  payload="$workdir/agent-web-shell.tar.gz"
  /usr/bin/curl -fsSL "$WEB_SHELL_URL" -o "$payload"
  /usr/bin/tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/web-shell" ]] || return 1
  /bin/mkdir -p "$WEB_SHELL_ROOT"
  /usr/bin/ditto "$workdir/web-shell/public" "$WEB_SHELL_ROOT/public"
  /usr/bin/ditto "$workdir/web-shell/scripts" "$WEB_SHELL_ROOT/scripts"
  for file in server.mjs runner.py package.json README.md; do
    [[ -f "$workdir/web-shell/$file" ]] && /bin/cp "$workdir/web-shell/$file" "$WEB_SHELL_ROOT/$file"
  done
  /usr/bin/xattr -dr com.apple.quarantine "$WEB_SHELL_ROOT" >/dev/null 2>&1 || true
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
  local backup_dir="$HERMES_ROOT/.archives/$profile-update.$(/bin/date +%Y%m%d%H%M%S)"
  /bin/mkdir -p "$backup_dir"
  if [[ -d "$profile_root" ]]; then
    /usr/bin/ditto "$profile_root" "$backup_dir/profile"
  fi
  printf "Backed up %s to %s\n" "$profile" "$backup_dir" >> "$LOG_FILE"
}

update_profile_from_payload() {
  local profile="$1"
  local source_dir="$2"
  local profile_root
  profile_root="$(profile_root_for "$profile")" || return 1
  [[ -d "$source_dir" ]] || return 1
  /bin/mkdir -p "$profile_root"
  backup_profile "$profile" "$profile_root"
  /usr/bin/rsync -a --delete \
    --exclude '.env' \
    --exclude 'auth.json' \
    --exclude 'config.yaml' \
    --exclude 'sessions/' \
    --exclude 'logs/' \
    --exclude 'memories/' \
    --exclude 'cache/' \
    --exclude 'cron/' \
    --exclude 'test-runs/' \
    "$source_dir/" "$profile_root/"
  enable_profile_telegram_platform "$profile_root"
  disable_profile_kanban_dispatch "$profile_root"
  /usr/bin/xattr -dr com.apple.quarantine "$profile_root" >/dev/null 2>&1 || true
}

update_agent_profiles() {
  local workdir payload profile source_dir
  workdir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/infobiz-profile.XXXXXX")"
  payload="$workdir/profile.tar.gz"
  /usr/bin/curl -fsSL "$PROFILE_URL" -o "$payload"
  /usr/bin/tar -xzf "$payload" -C "$workdir"
  [[ -d "$workdir/profile/agents" ]] || return 1
  for profile in marketer copywriter designer tech; do
    source_dir="$workdir/profile/agents/$profile"
    update_profile_from_payload "$profile" "$source_dir"
  done
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
[[ -d "$MARKETER_ROOT" ]] || fail "Marketer profile is not installed. Run the full installer first."
[[ -d "$COPYWRITER_ROOT" ]] || fail "Copywriter profile is not installed. Run the full installer first."
[[ -d "$DESIGNER_ROOT" ]] || fail "Designer profile is not installed. Run the full installer first."
[[ -d "$TECH_ROOT" ]] || fail "Tech profile is not installed. Run the full installer first."

/bin/mkdir -p "$INSTALL_ROOT"
: > "$LOG_FILE"
printf "Infobiz Agents patch-only update log\nStarted: %s\n" "$(/bin/date)" >> "$LOG_FILE"

say "Updating agent profiles"
update_agent_profiles >> "$LOG_FILE" 2>&1 || fail "Could not update agent profiles"

say "Patching Hermes image reference support"
patch_hermes_image_reference_support >> "$LOG_FILE" 2>&1 || fail "Could not patch Hermes image reference support"

say "Patching designer image generation rules"
patch_markdown_file "$DESIGNER_ROOT/SOUL.md" "SOUL.md" >> "$LOG_FILE" 2>&1
patch_markdown_file "$DESIGNER_ROOT/IMAGE_GENERATION_POLICY.md" "IMAGE_GENERATION_POLICY.md" >> "$LOG_FILE" 2>&1
patch_markdown_file "$DESIGNER_ROOT/skills/gpt-image-2-generation-basic/SKILL.md" "gpt-image-2-generation-basic" >> "$LOG_FILE" 2>&1

say "Patching tech no-code defaults"
patch_tech_no_code_defaults >> "$LOG_FILE" 2>&1 || fail "Could not patch tech no-code defaults"

say "Updating WebShell"
update_web_shell >> "$LOG_FILE" 2>&1 || fail "Could not update WebShell"

say "Configuring GPT-Image 2 High"
configure_designer_image_generation >> "$LOG_FILE" 2>&1 || fail "Could not configure GPT-Image 2 High for designer"

say "Patching Russian-only language rule"
patch_agents_russian_only >> "$LOG_FILE" 2>&1 || fail "Could not patch Russian-only agent language"

say "Patching Hermes Codex runtime safety"
patch_hermes_codex_runtime_safety >> "$LOG_FILE" 2>&1 || fail "Could not patch Hermes Codex runtime safety"

say "Restarting gateways"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
restart_launch_agent "ai.hermes.gateway" "$LAUNCH_AGENTS/ai.hermes.gateway.plist"
restart_launch_agent "ai.hermes.gateway-marketer" "$LAUNCH_AGENTS/ai.hermes.gateway-marketer.plist"
restart_launch_agent "ai.hermes.gateway-copywriter" "$LAUNCH_AGENTS/ai.hermes.gateway-copywriter.plist"
restart_launch_agent "ai.hermes.gateway-designer" "$LAUNCH_AGENTS/ai.hermes.gateway-designer.plist"
restart_launch_agent "ai.hermes.gateway-tech" "$LAUNCH_AGENTS/ai.hermes.gateway-tech.plist"
restart_launch_agent "com.infobiz.agents.web-shell" "$LAUNCH_AGENTS/com.infobiz.agents.web-shell.plist"

say "Patch complete"
if [[ -f "$INSTALL_ROOT/web-shell.url" ]]; then
  printf "WebShell: %s\n" "$(/usr/bin/head -n 1 "$INSTALL_ROOT/web-shell.url")"
fi
