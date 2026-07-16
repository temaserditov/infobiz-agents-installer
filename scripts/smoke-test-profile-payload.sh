#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
TARBALL="${PROFILE_TARBALL:-$REPO_ROOT/dist/infobiz-agent-profile-marketer-$VERSION.tar.gz}"
HERMES_AGENT_ROOT="${HERMES_AGENT_ROOT:-$HOME/.hermes/hermes-agent}"
PYTHON_BIN="${PYTHON_BIN:-$HERMES_AGENT_ROOT/venv/bin/python}"
EXPECTED_PROFILES=(default marketer copywriter designer tech)

say() {
  printf "==> %s\n" "$1"
}

fail() {
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

[[ -f "$TARBALL" ]] || fail "Profile payload not found: $TARBALL"
[[ -d "$HERMES_AGENT_ROOT" ]] || fail "Hermes agent source not found: $HERMES_AGENT_ROOT"
[[ -x "$PYTHON_BIN" ]] || fail "Hermes Python not found: $PYTHON_BIN"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-profile-smoke.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

say "Extracting profile payload"
tar -xzf "$TARBALL" -C "$TMP_ROOT"
PAYLOAD="$TMP_ROOT/profile"
[[ -d "$PAYLOAD" ]] || fail "Payload root missing"

say "Checking expected profiles"
for profile in "${EXPECTED_PROFILES[@]}"; do
  if [[ "$profile" == "default" ]]; then
    [[ -f "$PAYLOAD/default/SOUL.md" ]] || fail "Missing default/SOUL.md"
  else
    [[ -f "$PAYLOAD/agents/$profile/SOUL.md" ]] || fail "Missing agents/$profile/SOUL.md"
  fi
done
if [[ -d "$PAYLOAD/agents/producer" ]]; then
  fail "Unexpected producer profile found in payload"
fi

say "Checking payload privacy and runtime isolation"
python3 - "$PAYLOAD" <<'PY'
import json
import sys
from pathlib import Path

payload = Path(sys.argv[1])
forbidden_names = {
    ".env", "auth.json", "auth.lock", "config.yaml",
    "MEMORY.md", "USER.md", "LEARNING.md",
    "state.db", "state.db-shm", "state.db-wal",
    "response_store.db", "response_store.db-shm", "response_store.db-wal",
    "gateway.pid", "gateway.lock", "gateway_state.json",
    ".restart_last_processed.json",
    ".skills_prompt_snapshot.json",
}
forbidden_dirs = {
    "sessions", "memories", "logs", "cache", "audio_cache", "image_cache",
    "document_cache", "cron", "hooks", "pairing", "sandboxes", "home",
    "workspace", "plans", "local", ".archives", "test-runs", "tmp",
}

errors = []
for path in payload.rglob("*"):
    rel = path.relative_to(payload)
    if path.name.startswith("._") or path.name == ".DS_Store":
        errors.append(f"macOS metadata leaked: {rel}")
    if path.name in forbidden_names or path.name.startswith((".env.", "auth.json.", "config.yaml.", ".restart", ".skills_prompt_snapshot.json.")):
        errors.append(f"runtime/secret file leaked: {rel}")
    if path.is_dir() and path.name in forbidden_dirs:
        errors.append(f"runtime directory leaked: {rel}")

manifest_path = payload / "manifest.json"
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception as exc:
    errors.append(f"invalid manifest.json: {exc}")
else:
    if "source" in manifest:
        errors.append("manifest leaks local source path")
    if manifest.get("hermesRequires") != ">=0.18.2":
        errors.append("manifest hermesRequires is missing or unexpected")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print("Payload contains distribution files only.")
PY

say "Checking student skill allowlist"
python3 - "$PAYLOAD" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
allowed = {
    "marketer": {
        "audience-map-basic",
        "content-plan-basic",
        "discovery-diagnosis",
        "funnel-diagnosis-basic",
        "offer-builder-basic",
        "reality-check",
        "team-brief-builder",
        "telegram-warmup-basic",
    },
    "copywriter": {
        "chatplace-script-copy",
        "copy-editing-basic",
        "email-sequence-basic",
        "followup-basic",
        "landing-copy-basic",
        "reels-script-basic",
        "rewrite-anti-gpt",
        "telegram-post-basic",
        "warmup-sequence-basic",
        "webinar-script-basic",
    },
    "designer": {
        "canva-tilda-design-brief",
        "cover-banner-brief",
        "expert-landing-visual-pack",
        "gpt-image-2-generation-basic",
        "image-series-consistency",
        "instagram-carousel-production",
        "landing-visual-structure",
        "mvp-visual-system-basic",
        "presentation-structure-basic",
        "tech-handoff-for-page",
        "telegram-cover-and-creative-basic",
        "visual-audit-basic",
    },
    "tech": {
        "chatplace-basic-setup",
        "form-debugging",
        "mvp-funnel-tech-plan",
        "no-code-mvp-stack",
        "payment-debugging",
        "payments-tech",
        "safe-error-diagnosis",
        "secrets-safety",
        "telegram-bot-debugging",
        "timeweb-deploy-basic",
        "timeweb-deploy-tech",
    },
}

required = {
    "tech": {"payments-tech", "timeweb-deploy-tech"},
}

errors = []
for profile, allowed_names in allowed.items():
    skills_dir = payload / "agents" / profile / "skills"
    actual = {p.name for p in skills_dir.iterdir() if p.is_dir()} if skills_dir.exists() else set()
    unexpected = sorted(actual - allowed_names)
    missing = sorted(required.get(profile, set()) - actual)
    if unexpected:
        errors.append(f"{profile}: unexpected/premium skills in student payload: {', '.join(unexpected)}")
    if missing:
        errors.append(f"{profile}: required student skills missing: {', '.join(missing)}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Student skill allowlist looks sane.")
PY

say "Checking Hermes context-file scanner"
"$PYTHON_BIN" - "$PAYLOAD" "$HERMES_AGENT_ROOT" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
hermes_root = Path(sys.argv[2])
sys.path.insert(0, str(hermes_root))

try:
    from agent.prompt_builder import _scan_context_content
except Exception as exc:
    raise SystemExit(f"Could not import Hermes prompt scanner: {exc}")

errors = []
for path in sorted(payload.rglob("*.md")):
    text = path.read_text(encoding="utf-8", errors="ignore")
    scanned = _scan_context_content(text, path.name)
    if scanned.startswith("[BLOCKED:"):
        rel = path.relative_to(payload)
        errors.append(f"{rel}: {scanned}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Hermes scanner accepted all markdown context files.")
PY

say "Checking role identity headers"
python3 - "$PAYLOAD" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
expected = {
    "marketer": "Маркетолог",
    "copywriter": "Копирайтер",
    "designer": "Дизайнер",
    "tech": "Технарь",
}

errors = []
for profile, public_name in expected.items():
    soul = (payload / "agents" / profile / "SOUL.md").read_text(encoding="utf-8", errors="ignore")
    head = soul[:900]
    if '# Installed identity guard' not in head:
        errors.append(f"{profile}: missing Installed identity guard at top")
    if public_name not in head:
        errors.append(f"{profile}: public name {public_name!r} not found in identity guard")
    if "Hermes Agent (profile" in head or "AI-assistant in Hermes Agent" in head:
        errors.append(f"{profile}: technical Hermes identity leaked into guard")

default_soul = (payload / "default" / "SOUL.md").read_text(encoding="utf-8", errors="ignore")
if "Я Гермес" not in default_soul:
    errors.append("default: Hermes identity line missing")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Role identity headers look sane.")
PY

say "Checking Russian-only language contract"
python3 - "$PAYLOAD" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
targets = {
    "default": payload / "default" / "SOUL.md",
    "marketer": payload / "agents" / "marketer" / "SOUL.md",
    "copywriter": payload / "agents" / "copywriter" / "SOUL.md",
    "designer": payload / "agents" / "designer" / "SOUL.md",
    "tech": payload / "agents" / "tech" / "SOUL.md",
}

errors = []
for profile, path in targets.items():
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "INFOBIZ_RUSSIAN_ONLY_PATCH_START" not in text:
        errors.append(f"{profile}: missing Russian-only language patch")
    if "Always communicate with the user only in Russian" not in text:
        errors.append(f"{profile}: Russian-only rule text missing")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Russian-only language contract present.")
PY

say "Checking designer image generation contract"
python3 - "$PAYLOAD" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
files = [
    payload / "agents" / "designer" / "IMAGE_GENERATION_POLICY.md",
    payload / "agents" / "designer" / "skills" / "gpt-image-2-generation-basic" / "SKILL.md",
    payload / "agents" / "designer" / "COMMANDS.md",
]

errors = []
joined = ""
for path in files:
    if not path.exists():
        errors.append(f"missing {path.relative_to(payload)}")
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    joined += "\n" + text.lower()

required = [
    "gpt-image 2",
    "gpt-image 2 high",
    "without api",
    "image_generate",
    "actual image",
    "prompt-only",
    "python",
    "manual",
    "compositing",
    "preserve the original face",
    "reference-preserving",
    "do not replace the person",
    "different face",
    "do not moralize",
    "generic model",
    "failed draft",
    "image_url",
    "plain text-only generation",
]
for needle in required:
    if needle not in joined:
        errors.append(f"designer image contract missing {needle!r}")

bad_phrases = [
    "the answer must give not abstract advice, but a ready-to-use prompt",
    "give the student a short instruction: generate through",
]
for phrase in bad_phrases:
    if phrase in joined:
        errors.append(f"old prompt-only wording still present: {phrase!r}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Designer image generation contract looks direct.")
PY

say "Checking tech no-code default route"
python3 - "$PAYLOAD" <<'PY'
import sys
from pathlib import Path

payload = Path(sys.argv[1])
files = [
    payload / "agents" / "tech" / "SOUL.md",
    payload / "agents" / "tech" / "AGENTS.md",
    payload / "agents" / "tech" / "COMMANDS.md",
    payload / "agents" / "tech" / "skills" / "no-code-mvp-stack" / "SKILL.md",
    payload / "agents" / "tech" / "skills" / "chatplace-basic-setup" / "SKILL.md",
    payload / "agents" / "tech" / "knowledge" / "04-payments.md",
]

errors = []
joined = ""
for path in files:
    if not path.exists():
        errors.append(f"missing {path.relative_to(payload)}")
        continue
    joined += "\n" + path.read_text(encoding="utf-8", errors="ignore").lower()

required = [
    "infobiz no-code default route",
    "telegram -> chatplace",
    "prodamus",
    "python",
    "postgresql",
    "do not propose python",
    "do not propose postgresql",
    "chatplace is the canonical first route",
    "prodamus is the default payment route",
]
for needle in required:
    if needle not in joined:
        errors.append(f"tech no-code contract missing {needle!r}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Tech no-code defaults look sane.")
PY

if [[ "${LIVE_SMOKE:-0}" == "1" ]]; then
  say "Running optional live greeting smoke test"
  PROFILE="${PROFILE:-marketer}"
  PROMPT="${PROMPT:-Кто ты? Ответь одним коротким предложением.}"
  EXPECT="${EXPECT:-Маркетолог}"
  LIVE_HOME="$TMP_ROOT/live-home"
  mkdir -p "$LIVE_HOME/profiles/$PROFILE" "$TMP_ROOT/approvals"
  rsync -a "$PAYLOAD/agents/$PROFILE/" "$LIVE_HOME/profiles/$PROFILE/"
  if [[ -f "$HOME/.hermes/auth.json" ]]; then
    cp "$HOME/.hermes/auth.json" "$LIVE_HOME/profiles/$PROFILE/auth.json"
  fi
  if [[ -f "$HOME/.hermes/.env" ]]; then
    cp "$HOME/.hermes/.env" "$LIVE_HOME/profiles/$PROFILE/.env"
  fi
  cat >> "$LIVE_HOME/profiles/$PROFILE/.env" <<ENV
HERMES_HOME='$LIVE_HOME/profiles/$PROFILE'
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
HERMES_KANBAN_DISPATCH_IN_GATEWAY='false'
ENV

  OUT_FILE="$TMP_ROOT/live-output.jsonl"
  HERMES_HOME="$LIVE_HOME/profiles/$PROFILE" \
  HERMES_AGENT_ROOT="$HERMES_AGENT_ROOT" \
  PYTHONPATH="$HERMES_AGENT_ROOT" \
  AGENT_WEB_APPROVAL_DIR="$TMP_ROOT/approvals" \
  AGENT_WEB_TOOLSETS="clarify" \
    "$PYTHON_BIN" "$REPO_ROOT/web-shell/runner.py" \
      --profile "$PROFILE" \
      --session-id "smoke-$(date +%s)" \
      --prompt "$PROMPT" > "$OUT_FILE"

  python3 - "$OUT_FILE" "$EXPECT" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
expect = sys.argv[2].lower()
final = ""
for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
    try:
        event = json.loads(line)
    except Exception:
        continue
    if event.get("type") == "run.failed":
        raise SystemExit(f"Live smoke failed: {event.get('error')}")
    if event.get("type") == "run.completed":
        final = event.get("output") or ""

print(final)
if expect not in final.lower():
    raise SystemExit(f"Expected {expect!r} in live response")
PY
fi

say "Profile payload smoke test passed"
