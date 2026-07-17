#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-messaging-smoke.XXXXXX")"
export TEST_MESSAGING_MARKER="$WORK/messaging-ready"
export TEST_UV_TRACE="$WORK/uv-trace"
export HERMES_ROOT="$WORK/hermes"
export INSTALL_ROOT="$WORK/install"
export HERMES_UV_CMD="$WORK/uv"
export INFOBIZ_UPDATE_LIBRARY_ONLY=1

mkdir -p "$HERMES_ROOT/hermes-agent/venv/bin" "$INSTALL_ROOT"

cat > "$HERMES_ROOT/hermes-agent/venv/bin/python" <<'SH'
#!/bin/sh
if [ -f "$TEST_MESSAGING_MARKER" ]; then
  exit 0
fi
exit 1
SH
chmod +x "$HERMES_ROOT/hermes-agent/venv/bin/python"

cat > "$HERMES_UV_CMD" <<'SH'
#!/bin/sh
printf '%s\n' "$*" > "$TEST_UV_TRACE"
printf '%s\n' "${UV_PROJECT_ENVIRONMENT:-}" >> "$TEST_UV_TRACE"
touch "$TEST_MESSAGING_MARKER"
SH
chmod +x "$HERMES_UV_CMD"

source "$REPO_ROOT/update-infobiz-agents.sh"
ensure_hermes_messaging_support

[[ -f "$TEST_MESSAGING_MARKER" ]]
grep -Fq 'sync --extra all --extra messaging --locked' "$TEST_UV_TRACE"
grep -Fq "$HERMES_ROOT/hermes-agent/venv" "$TEST_UV_TRACE"

echo "Hermes messaging dependency recovery passed."
