#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/web-shell"
OUT_DIR="$REPO_ROOT/dist"
TARGET="$OUT_DIR/agent-web-shell-$VERSION.tar.gz"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-web-shell-build.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

[[ -f "$SOURCE/server.mjs" && -f "$SOURCE/public/index.html" ]] || {
  printf 'ERROR: WebShell source is incomplete: %s\n' "$SOURCE" >&2
  exit 1
}

node --check "$SOURCE/server.mjs"
node --check "$SOURCE/public/app.js"
node --check "$SOURCE/scripts/smoke.mjs"
node "$SOURCE/scripts/redaction-smoke.mjs"
node "$SOURCE/scripts/codex-package-smoke.mjs"
python3 -m py_compile "$SOURCE/runner.py"
node "$REPO_ROOT/scripts/build-codex-support-package.mjs" >/dev/null

mkdir -p "$OUT_DIR"
COPYFILE_DISABLE=1 tar --uid 0 --gid 0 \
  --exclude 'web-shell/runs' \
  --exclude 'web-shell/approvals' \
  --exclude 'web-shell/snapshots' \
  --exclude 'web-shell/preflights' \
  --exclude 'web-shell/uploads' \
  --exclude 'web-shell/baseline.json' \
  --exclude 'web-shell/node_modules' \
  --exclude 'web-shell/__pycache__' \
  --exclude 'web-shell/*.log' \
  --exclude 'web-shell/.DS_Store' \
  --exclude 'web-shell/._*' \
  -C "$REPO_ROOT" -czf "$TMP_ROOT/web-shell.tar.gz" web-shell

tar -xzf "$TMP_ROOT/web-shell.tar.gz" -C "$TMP_ROOT"
for runtime_dir in runs approvals snapshots preflights uploads node_modules __pycache__; do
  [[ ! -e "$TMP_ROOT/web-shell/$runtime_dir" ]] || {
    printf 'ERROR: runtime directory leaked into WebShell payload: %s\n' "$runtime_dir" >&2
    exit 1
  }
done

mv "$TMP_ROOT/web-shell.tar.gz" "$TARGET"
printf '%s\n' "$TARGET"
