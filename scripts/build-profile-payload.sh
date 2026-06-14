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

if [[ ! -d "$AGENT_PRODUCT_SOURCE/agents" ]]; then
  echo "Missing agent product source: $AGENT_PRODUCT_SOURCE" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR/agents" "$PAYLOAD_DIR/default" "$PAYLOAD_DIR/skills" "$OUT_DIR"

copy_agent() {
  local source_name="$1"
  local target_name="$2"
  local source_dir="$AGENT_PRODUCT_SOURCE/agents/$source_name"
  local target_dir="$PAYLOAD_DIR/agents/$target_name"
  if [[ ! -d "$source_dir" ]]; then
    echo "Missing agent source: $source_dir" >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  /usr/bin/rsync -a \
    --exclude '.DS_Store' \
    --exclude '*.ru.bak' \
    --exclude '__pycache__/' \
    --exclude '.curator_state' \
    --exclude '.curator_backups' \
    --exclude '.bundled_manifest' \
    --exclude '.usage.json' \
    --exclude 'test-runs/' \
    --exclude 'tests/' \
    "$source_dir/" "$target_dir/"
}

copy_agent "ai-marketer-for-expert" "marketer"
copy_agent "ai-copywriter" "copywriter"
copy_agent "ai-designer" "designer"
copy_agent "ai-tech" "tech"

/usr/bin/rsync -a \
  --exclude '.DS_Store' \
  --exclude '*.ru.bak' \
  --exclude '__pycache__/' \
  --exclude 'agents/' \
  --exclude 'scripts/' \
  --exclude 'tests/' \
  --exclude 'test-runs/' \
  --exclude 'subagents/' \
  --exclude 'shared-knowledge/' \
  "$AGENT_PRODUCT_SOURCE/" "$PAYLOAD_DIR/default/"

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
  "source": "$AGENT_PRODUCT_SOURCE",
  "profiles": ["default", "marketer", "copywriter", "designer", "tech"],
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSON

tar -C "$BUILD_DIR" -czf "$TARBALL" profile
echo "$TARBALL"
