#!/bin/zsh
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist"
BUILD_DIR="$REPO_ROOT/profile-build"
PAYLOAD_DIR="$BUILD_DIR/profile"
AGENT_PRODUCT_SOURCE="${AGENT_PRODUCT_SOURCE:-$HOME/.hermes-workspaces/marketer/agent-product}"
TARBALL="$OUT_DIR/infobiz-agent-profile-marketer-$VERSION.tar.gz"

if [[ -d "$AGENT_PRODUCT_SOURCE/agents" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE/agents"
elif [[ -d "$AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN"
elif [[ -d "$AGENT_PRODUCT_SOURCE/ai-marketer-for-expert" ]]; then
  AGENT_SOURCE_ROOT="$AGENT_PRODUCT_SOURCE"
else
  echo "Missing agent product source: $AGENT_PRODUCT_SOURCE" >&2
  echo "Expected one of:" >&2
  echo "  $AGENT_PRODUCT_SOURCE/agents" >&2
  echo "  $AGENT_PRODUCT_SOURCE/03_RUNTIME_PROFILES_CLEAN" >&2
  echo "  $AGENT_PRODUCT_SOURCE/ai-marketer-for-expert" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR/agents" "$PAYLOAD_DIR/default" "$PAYLOAD_DIR/skills" "$OUT_DIR"

copy_agent() {
  local source_name="$1"
  local target_name="$2"
  local role_name="$3"
  local public_name="$4"
  local source_dir="$AGENT_SOURCE_ROOT/$source_name"
  local target_dir="$PAYLOAD_DIR/agents/$target_name"
  local soul_tmp
  if [[ ! -d "$source_dir" ]]; then
    echo "Missing agent source: $source_dir" >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  /usr/bin/rsync -a \
    --exclude '.DS_Store' \
    --exclude '*.ru.bak' \
    --exclude 'config.yaml' \
    --exclude '__pycache__/' \
    --exclude '.curator_state' \
    --exclude '.curator_backups' \
    --exclude '.bundled_manifest' \
    --exclude '.usage.json' \
    --exclude 'test-runs/' \
    --exclude 'tests/' \
    "$source_dir/" "$target_dir/"
  while IFS= read -r md_file; do
    /usr/bin/perl -0pi -e 's/\bdo not pretend to be\b/do not present yourself as/gi; s/\bmust not pretend\b/must not claim/gi; s/\bdo not pretend\b/do not claim/gi; s/\bpretending\b/claiming/gi; s/\bpretend\b/claim/gi' "$md_file"
  done < <(/usr/bin/find "$target_dir" -type f -name '*.md')
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

# Backward compatibility for the older macOS single-agent installer.
if [[ -d "$PAYLOAD_DIR/agents/marketer/skills" ]]; then
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
  "source": "agent-product",
  "profiles": ["default", "marketer", "copywriter", "designer", "tech"],
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSON

tar -C "$BUILD_DIR" -czf "$TARBALL" profile
/bin/rm -rf "$BUILD_DIR"
echo "$TARBALL"
