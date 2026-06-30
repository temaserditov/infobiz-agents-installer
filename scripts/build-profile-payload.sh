#!/bin/zsh
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist"
BUILD_DIR="$REPO_ROOT/profile-build"
PAYLOAD_DIR="$BUILD_DIR/profile"
DEFAULT_AGENT_PRODUCT_SOURCE="$HOME/.hermes-workspaces/marketer/agent-product"
AGENT_PRODUCT_SOURCE="${AGENT_PRODUCT_SOURCE:-$DEFAULT_AGENT_PRODUCT_SOURCE}"
PRUNE_STUDENT_SKILLS="${PRUNE_STUDENT_SKILLS:-auto}"
TARBALL="$OUT_DIR/infobiz-agent-profile-marketer-$VERSION.tar.gz"

has_runtime_profiles() {
  local root="$1"
  [[ -d "$root/marketer" && -d "$root/copywriter" && -d "$root/designer" && -d "$root/tech" ]]
}

AGENT_SOURCE_MODE="agent-product"
if [[ -d "$AGENT_PRODUCT_SOURCE/agents" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE/agents"
elif [[ -d "$AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN"
elif [[ -d "$AGENT_PRODUCT_SOURCE/ai-marketer-for-expert" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE"
elif has_runtime_profiles "$AGENT_PRODUCT_SOURCE"; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE"
  AGENT_SOURCE_MODE="hermes-profiles"
elif [[ "$AGENT_PRODUCT_SOURCE" == "$DEFAULT_AGENT_PRODUCT_SOURCE" ]] && has_runtime_profiles "$HOME/.hermes/profiles"; then
  AGENT_PRODUCT_SOURCE="$HOME/.hermes/profiles"
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE"
  AGENT_SOURCE_MODE="hermes-profiles"
else
  echo "Missing agent product source: $AGENT_PRODUCT_SOURCE" >&2
  echo "Expected one of:" >&2
  echo "  $AGENT_PRODUCT_SOURCE/agents" >&2
  echo "  $AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN" >&2
  echo "  $AGENT_PRODUCT_SOURCE/ai-marketer-for-expert" >&2
  echo "  $AGENT_PRODUCT_SOURCE/{marketer,copywriter,designer,tech}" >&2
  echo "  $HOME/.hermes/profiles/{marketer,copywriter,designer,tech}" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR/agents" "$PAYLOAD_DIR/default" "$PAYLOAD_DIR/skills" "$OUT_DIR"

allowed_skills_for_profile() {
  case "$1" in
    marketer)
      printf "%s\n" \
        audience-map-basic \
        content-plan-basic \
        discovery-diagnosis \
        funnel-diagnosis-basic \
        offer-builder-basic \
        reality-check \
        team-brief-builder \
        telegram-warmup-basic
      ;;
    copywriter)
      printf "%s\n" \
        chatplace-script-copy \
        copy-editing-basic \
        email-sequence-basic \
        followup-basic \
        landing-copy-basic \
        reels-script-basic \
        rewrite-anti-gpt \
        telegram-post-basic \
        warmup-sequence-basic \
        webinar-script-basic
      ;;
    designer)
      printf "%s\n" \
        canva-tilda-design-brief \
        cover-banner-brief \
        expert-landing-visual-pack \
        gpt-image-2-generation-basic \
        image-series-consistency \
        instagram-carousel-production \
        landing-visual-structure \
        mvp-visual-system-basic \
        presentation-structure-basic \
        tech-handoff-for-page \
        telegram-cover-and-creative-basic \
        visual-audit-basic
      ;;
    tech)
      printf "%s\n" \
        chatplace-basic-setup \
        form-debugging \
        mvp-funnel-tech-plan \
        no-code-mvp-stack \
        payment-debugging \
        payments-tech \
        safe-error-diagnosis \
        secrets-safety \
        telegram-bot-debugging \
        timeweb-deploy-basic \
        timeweb-deploy-tech
      ;;
  esac
}

prune_agent_skills() {
  local target_name="$1"
  local skills_dir="$PAYLOAD_DIR/agents/$target_name/skills"
  local allowed_file="$BUILD_DIR/allowed-skills-$target_name.txt"
  local skill_dir skill_name
  [[ -d "$skills_dir" ]] || return 0

  allowed_skills_for_profile "$target_name" > "$allowed_file"
  find "$skills_dir" -mindepth 1 -maxdepth 1 -type d -print0 | while IFS= read -r -d '' skill_dir; do
    skill_name="$(basename "$skill_dir")"
    if ! /usr/bin/grep -Fxq "$skill_name" "$allowed_file"; then
      echo "removed non-student skill from $target_name: $skill_name" >&2
      rm -rf "$skill_dir"
    fi
  done
}

should_prune_agent_skills() {
  case "$PRUNE_STUDENT_SKILLS" in
    0|false|no) return 1 ;;
    1|true|yes) return 0 ;;
  esac
  return 0
}

patch_designer_image_contract_file() {
  local file="$1"
  local title="$2"
  mkdir -p "$(dirname "$file")"
  python3 - "$file" "$title" <<'PY'
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

- If the user asks to generate/create/make/draw/edit/change/add/extend an image, photo, cover, banner, creative, illustration, or visual, generate the actual image.
- If the user asks in Russian to сгенерировать, сделать, нарисовать, изменить, добавить, дорисовать, расширить, заменить фон, or переодеть a картинка/изображение/фото/баннер/креатив, generate or edit the actual image.
- Do not answer with only a prompt unless the user explicitly asks for a prompt or image generation is technically unavailable.
- Use GPT-Image 2 High through the authorized Hermes/OpenAI-Codex image provider, without API key.
- Do not ask whether to use GPT-Image 2. The route is fixed: GPT-Image 2 High through the authorized OpenAI-Codex provider.
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

- If the current Telegram/web message contains a source image plus an edit/generation instruction, the first assistant action after understanding the task must be `image_generate` with `reference_image`. Do not answer with analysis first.
- Do not say "I can only make a prompt", "I cannot preserve the face", "use a mask", or similar caveats before trying the available image tool. Try the reference-image generation route first.
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
- If the generated result changes the face/head or produces a different face, treat it as a failed draft. Regenerate with stronger identity-lock instructions and the original image as reference/input. Do not send a changed-identity result as final.
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

apply_designer_image_contract_patch() {
  local designer_dir="$PAYLOAD_DIR/agents/designer"
  [[ -d "$designer_dir" ]] || return 0
  patch_designer_image_contract_file "$designer_dir/IMAGE_GENERATION_POLICY.md" "Designer image generation policy"
  patch_designer_image_contract_file "$designer_dir/skills/gpt-image-2-generation-basic/SKILL.md" "GPT-Image 2 generation"
  patch_designer_image_contract_file "$designer_dir/COMMANDS.md" "Designer commands"
  patch_designer_image_contract_file "$designer_dir/SOUL.md" "Designer soul"
}

copy_agent() {
  local source_name="$1"
  local target_name="$2"
  local role_name="$3"
  local public_name="$4"
  local source_dir="$AGENT_SOURCE_ROOT/$source_name"
  local target_dir="$PAYLOAD_DIR/agents/$target_name"
  local soul_tmp
  if [[ ! -d "$source_dir" && "$AGENT_SOURCE_MODE" == "hermes-profiles" ]]; then
    source_dir="$AGENT_SOURCE_ROOT/$target_name"
  fi
  if [[ ! -d "$source_dir" ]]; then
    echo "Missing agent source: $source_dir" >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  /usr/bin/rsync -a \
    --exclude '.DS_Store' \
    --exclude '*.ru.bak' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude 'auth.json' \
    --exclude 'auth.lock' \
    --exclude 'config.yaml' \
    --exclude '__pycache__/' \
    --exclude 'bin/' \
    --exclude 'cache/' \
    --exclude 'context/' \
    --exclude 'reports/' \
    --exclude 'logs/' \
    --exclude 'sessions/' \
    --exclude 'memories/' \
    --exclude 'audio_cache/' \
    --exclude 'image_cache/' \
    --exclude 'document_cache/' \
    --exclude 'cron/' \
    --exclude 'hooks/' \
    --exclude 'pairing/' \
    --exclude 'sandboxes/' \
    --exclude 'tmp/' \
    --exclude 'state.db' \
    --exclude 'state.db-shm' \
    --exclude 'state.db-wal' \
    --exclude 'gateway.pid' \
    --exclude 'gateway.lock' \
    --exclude 'gateway_state.json' \
    --exclude 'models_dev_cache.json' \
    --exclude 'context_length_cache.yaml' \
    --exclude 'channel_directory.json' \
    --exclude 'processes.json' \
    --exclude '.curator_state' \
    --exclude '.curator_backups' \
    --exclude '.bundled_manifest' \
    --exclude '.usage.json' \
    --exclude '.usage.json.lock' \
    --exclude '.hub/' \
    --exclude 'skills/.hub/' \
    --exclude '.archives/' \
    --exclude 'test-runs/' \
    --exclude 'tests/' \
    "$source_dir/" "$target_dir/"
  while IFS= read -r md_file; do
    /usr/bin/perl -0pi -e 's/\bdo not pretend to be\b/do not present yourself as/gi; s/\bmust not pretend\b/must not claim/gi; s/\bdo not pretend\b/do not claim/gi; s/\bpretending\b/claiming/gi; s/\bpretend\b/claim/gi' "$md_file"
  done < <(/usr/bin/find "$target_dir" -type f -name '*.md')
  if should_prune_agent_skills; then
    prune_agent_skills "$target_name"
  fi
  if [[ -f "$target_dir/SOUL.md" ]] && /usr/bin/grep -q "Installed identity guard" "$target_dir/SOUL.md"; then
    # Source SOUL already carries an authored identity guard (e.g. the refactored
    # per-role team-intro guard pulled from the live Hermes profiles). Do NOT
    # prepend the generic guard again — that would double-inject. Idempotent.
    echo "identity guard already present in $target_name/SOUL.md — keeping authored guard" >&2
  elif [[ -f "$target_dir/SOUL.md" ]]; then
    soul_tmp="$target_dir/SOUL.md.tmp"
    cat > "$soul_tmp" <<IDENTITY
# Installed identity guard

Рабочее имя этого профиля для ученика: "$public_name".

В ответах пользователю используй это имя. Hermes — это платформа и отдельный главный профиль, а не публичное имя этого профиля.

Если пользователь здоровается, проверяет личность, спрашивает "кто ты?", "что ты умеешь?", "ты кто?", или пишет короткое первое сообщение, отвечай из своей роли:

"Я $public_name. Помогаю с задачами своей роли: [кратко 1-2 предложения по сути роли]."

Никогда не начинай такой ответ с технического описания среды запуска.

IDENTITY
    cat "$target_dir/SOUL.md" >> "$soul_tmp"
    mv "$soul_tmp" "$target_dir/SOUL.md"
  fi
}

copy_agent "ai-marketer-for-expert" "marketer" "Marketer" "Маркетолог"
copy_agent "ai-copywriter" "copywriter" "Copywriter" "Копирайтер"
copy_agent "ai-designer" "designer" "Designer" "Дизайнер"
copy_agent "ai-tech" "tech" "Tech Agent" "Технарь"

apply_designer_image_contract_patch
"$SCRIPT_DIR/patch-tech-no-code-defaults.py" "$PAYLOAD_DIR/agents/tech"

cat > "$PAYLOAD_DIR/default/SOUL.md" <<'SOUL'
# SOUL.md — Hermes

## Role

You are Hermes, the main agent in a compact AI team for experts and online businesses.

You are not the marketer, copywriter, designer, or tech specialist. You are the front door and dispatcher:

- answer simple general questions yourself;
- clarify vague requests;
- help the user choose the right next step;
- route specialized work to the right agent with a clear brief;
- keep the team lightweight and practical.

Installed role agents:

- **Marketer** — business diagnostics, audience, offer, packaging, content strategy, funnel, sales logic.
- **Copywriter** — landing pages, posts, emails, warm-up sequences, webinars, scripts, long-form copy after strategy is clear.
- **Designer** — visual packaging, landing/page structure, presentation, creatives, covers, visual hierarchy.
- **Tech Agent** — code, deployment, sites, bots, integrations, payments, automation, server and installer diagnostics.

If the user asks “who are you?” or tests identity, answer clearly: “Я Гермес, главный агент. Я помогаю сориентироваться и подключить нужного агента.”

If the task clearly belongs to one role, do not present yourself as that role. Give the user a concise routing suggestion and a ready prompt/brief for the right agent. If the task is small and general, solve it yourself.

## Telegram trigger rule

- If an incoming group message contains only your @username, name, or a short ping without a clear task, do not use tools. Answer briefly: “Я тут. Что нужно сделать?”
- Start work when the current message contains an explicit task, a reply to a task, a direct handoff from another agent, or a short “делай/продолжай/ок” in a personal DM that clearly refers to the previous actionable message.
- Do not recover tasks from old group history when the current message does not ask for them.

## Lazy context rule

- Do not scan files, skills, memory, sessions, logs, Telegram, Notion, Obsidian, or terminal at startup.
- Use tools only when needed for the current explicit task.
- For simple questions, answer directly.
- For diagnostics, choose the smallest useful check and report what you found.

## Anti-bloat task rule

- Treat each new user request as a fresh bounded task unless the user explicitly asks to continue the immediately previous task.
- Do not load broad history or old sessions just to “remember context”.
- If context is bloated or stale, say so and suggest starting a clean session.

## OpenClaw isolation rule

- OpenClaw is legacy residue. Do not read, run, or use `.openclaw` paths unless the user explicitly asks for OpenClaw migration, audit, cleanup, or recovery.
SOUL

"$SCRIPT_DIR/patch-agent-russian-only.py" \
  "$PAYLOAD_DIR/default/SOUL.md" \
  "$PAYLOAD_DIR/agents/marketer/SOUL.md" \
  "$PAYLOAD_DIR/agents/copywriter/SOUL.md" \
  "$PAYLOAD_DIR/agents/designer/SOUL.md" \
  "$PAYLOAD_DIR/agents/tech/SOUL.md"

# Backward compatibility for the older macOS single-agent installer.
if [[ "$AGENT_SOURCE_MODE" != "hermes-profiles" && -d "$PAYLOAD_DIR/agents/marketer/skills" ]]; then
  /usr/bin/rsync -a "$PAYLOAD_DIR/agents/marketer/skills/" "$PAYLOAD_DIR/skills/"
fi

if [[ -d "$REPO_ROOT/skills" ]]; then
  /usr/bin/rsync -a \
    --exclude '.DS_Store' \
    --exclude '__pycache__/' \
    "$REPO_ROOT/skills/" "$PAYLOAD_DIR/skills/"
fi

cat > "$PAYLOAD_DIR/manifest.json" <<JSON
{
  "version": "$VERSION",
  "source": "$AGENT_SOURCE_MODE:$AGENT_PRODUCT_SOURCE",
  "profiles": ["default", "marketer", "copywriter", "designer", "tech"],
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSON

tar -C "$BUILD_DIR" -czf "$TARBALL" profile
/bin/rm -rf "$BUILD_DIR"
echo "$TARBALL"
