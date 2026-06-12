#!/bin/zsh
set -euo pipefail

AGENT_PROFILE="${AGENT_PROFILE:-marketer}"
VERSION="${VERSION:-0.1.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist"
BUILD_DIR="$REPO_ROOT/profile-build"
PAYLOAD_DIR="$BUILD_DIR/profile"
PROFILE_SOURCE="${PROFILE_SOURCE:-$HOME/.hermes/profiles/$AGENT_PROFILE}"
SKILLS_SOURCE="${SKILLS_SOURCE:-$PROFILE_SOURCE/skills}"
TARBALL="$OUT_DIR/infobiz-agent-profile-$AGENT_PROFILE-$VERSION.tar.gz"

if [[ ! -d "$PROFILE_SOURCE" ]]; then
  echo "Missing profile source: $PROFILE_SOURCE" >&2
  exit 1
fi
if [[ ! -d "$SKILLS_SOURCE" ]]; then
  echo "Missing skills source: $SKILLS_SOURCE" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR/skills" "$OUT_DIR"

/usr/bin/rsync -a \
  --exclude '.DS_Store' \
  --exclude '__pycache__' \
  --exclude '.curator_state' \
  --exclude '.curator_backups' \
  --exclude '.bundled_manifest' \
  --exclude '.usage.json' \
  "$SKILLS_SOURCE/" "$PAYLOAD_DIR/skills/"

if [[ -d "$REPO_ROOT/skills" ]]; then
  /usr/bin/rsync -a \
    --exclude '.DS_Store' \
    --exclude '__pycache__' \
    "$REPO_ROOT/skills/" "$PAYLOAD_DIR/skills/"
fi

tar -C "$BUILD_DIR" -czf "$TARBALL" profile
echo "$TARBALL"
