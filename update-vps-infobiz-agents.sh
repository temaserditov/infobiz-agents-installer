#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
HERMES_AGENT_ROOT="$HERMES_ROOT/hermes-agent"
DESIGNER_ROOT="$HERMES_ROOT/profiles/designer"

say() {
  printf "==> %s\n" "$1"
}

fail() {
  printf "\nERROR: %s\n" "$1" >&2
  exit 1
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
- In Telegram, send the generated result as a native image when possible: image URL or `MEDIA:/absolute/path`.

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

[[ "$(uname -s)" == "Linux" ]] || fail "This updater supports Linux VPS only."
[[ -d "$HERMES_AGENT_ROOT" ]] || fail "Hermes is not installed. Run the full installer first."
[[ -x "$HERMES_AGENT_ROOT/venv/bin/python" ]] || fail "Hermes Python venv is missing. Run the full installer first."
[[ -d "$DESIGNER_ROOT" ]] || fail "Designer profile is not installed. Run the full installer first."

say "Patching designer image generation rules"
patch_markdown_file "$DESIGNER_ROOT/SOUL.md" "SOUL.md"
patch_markdown_file "$DESIGNER_ROOT/IMAGE_GENERATION_POLICY.md" "IMAGE_GENERATION_POLICY.md"
patch_markdown_file "$DESIGNER_ROOT/skills/gpt-image-2-generation-basic/SKILL.md" "gpt-image-2-generation-basic"

say "Configuring GPT-Image 2 High"
configure_designer_image_generation

say "Restarting designer gateway"
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart infobiz-hermes-gateway-designer.service >/dev/null 2>&1 || true
  systemctl restart infobiz-web-shell.service >/dev/null 2>&1 || true
fi

say "Patch complete"
