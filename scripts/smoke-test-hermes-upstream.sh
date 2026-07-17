#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$HOME/.hermes/hermes-agent/venv/bin/python}"
HERMES_RELEASE_API="${HERMES_RELEASE_API:-https://api.github.com/repos/NousResearch/hermes-agent/releases/latest}"
HERMES_FALLBACK_TAG="${HERMES_FALLBACK_TAG:-v2026.7.7.2}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-hermes-upstream-smoke.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ -x "$PYTHON_BIN" ]] || fail "Hermes Python not found: $PYTHON_BIN"
"$PYTHON_BIN" -c 'import yaml' >/dev/null 2>&1 || fail "PyYAML is required in $PYTHON_BIN"

fetch_source() {
  local name="$1"
  local url="$2"
  local target="$WORK/$name"
  mkdir -p "$target"
  curl -fsSL "$url" -o "$WORK/$name.tar.gz"
  tar --strip-components=1 -xzf "$WORK/$name.tar.gz" -C "$target"
  [[ -f "$target/setup-hermes.sh" && -f "$target/pyproject.toml" ]] \
    || fail "Invalid Hermes source archive: $name"
}

patch_setup_noninteractive() {
  local setup_path="$1/setup-hermes.sh"
  local tmp_path="$setup_path.infobiz"
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
  ' "$setup_path" > "$tmp_path"
  mv "$tmp_path" "$setup_path"
  bash -n "$setup_path"
  if grep -E '^[[:space:]]*read[[:space:]]+-p' "$setup_path" >/dev/null; then
    fail "Official Hermes setup contains an unhandled interactive prompt"
  fi
}

patch_and_check() {
  local name="$1"
  local source="$WORK/$name"
  local home="$WORK/home-$name"
  local profile dir
  mkdir -p "$home/profiles/marketer" "$home/profiles/copywriter" "$home/profiles/designer" "$home/profiles/tech"
  patch_setup_noninteractive "$source"
  for profile in default marketer copywriter designer tech; do
    if [[ "$profile" == "default" ]]; then
      dir="$home"
    else
      dir="$home/profiles/$profile"
    fi
    printf "model:\n  provider: openai-codex\n  default: gpt-5.4-mini\n  openai_runtime: codex_app_server\n  api_mode: codex_app_server\n  context_length: 100000\nstreaming:\n  enabled: true\n  transport: edit\ndisplay:\n  streaming: true\n  interim_assistant_messages: true\n  tool_progress: all\n  long_running_notifications: true\n  busy_ack_detail: true\n  platforms:\n    telegram:\n      streaming: true\n      tool_progress: all\n      long_running_notifications: true\n      busy_ack_detail: true\ncompression:\n  enabled: false\nmemory:\n  nudge_interval: 0\nskills:\n  creation_nudge_interval: 0\n" > "$dir/config.yaml"
    printf "GATEWAY_ALLOW_ALL_USERS='true'\n" > "$dir/.env"
  done

  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-image-reference.py" "$source"
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-telegram-text-photo-merge.py" "$source"
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-local-media-markdown.py" "$source"
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-telegram-reliability.py" "$source"
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-codex-runtime-safety.py" \
    --hermes-root "$home" --hermes-agent-root "$source" \
    --profiles marketer,copywriter,designer,tech

  # A second pass proves every patch is idempotent.
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-image-reference.py" "$source" >/dev/null
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-telegram-text-photo-merge.py" "$source" >/dev/null
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-local-media-markdown.py" "$source" >/dev/null
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-telegram-reliability.py" "$source" >/dev/null
  "$PYTHON_BIN" "$SCRIPT_DIR/patch-hermes-codex-runtime-safety.py" \
    --hermes-root "$home" --hermes-agent-root "$source" \
    --profiles marketer,copywriter,designer,tech >/dev/null

  "$PYTHON_BIN" -m py_compile \
    "$source/agent/transports/codex_app_server_session.py" \
    "$source/agent/codex_runtime.py" \
    "$source/gateway/run.py" \
    "$source/plugins/platforms/telegram/adapter.py" \
    "$source/gateway/platforms/base.py" \
    "$source/tools/image_generation_tool.py" \
    "$source/plugins/image_gen/openai-codex/__init__.py"

  grep -Fq "GATEWAY_ALLOW_ALL_USERS='false'" "$home/.env" \
    || fail "$name: Telegram default was not closed"
  grep -Fq "HERMES_CODEX_EVENT_STALE_TIMEOUT_SECONDS='120'" "$home/.env" \
    || fail "$name: Codex event watchdog was not relaxed"
  grep -Fq "HERMES_CODEX_TTFB_TIMEOUT_SECONDS='120'" "$home/.env" \
    || fail "$name: Codex TTFB watchdog was not configured"
  grep -Fq "HERMES_DISABLE_TELEGRAM_TYPING_REFRESH='true'" "$home/.env" \
    || fail "$name: Telegram typing refresh was not disabled"
  grep -Fq "HERMES_TELEGRAM_CHUNK_DELAY_SECONDS='1.2'" "$home/.env" \
    || fail "$name: Telegram chunk pacing was not configured"
  grep -Fq 'INFOBIZ_TELEGRAM_TYPING_REFRESH_GUARD' "$source/gateway/platforms/base.py" \
    || fail "$name: Telegram typing refresh guard was not patched"
  grep -Fq 'INFOBIZ_TELEGRAM_CHUNK_PACING' "$source/plugins/platforms/telegram/adapter.py" \
    || fail "$name: Telegram chunk pacing was not patched"
  grep -Fq 'codex\s+stream\s+sent\s+no\s+events' "$source/gateway/run.py" \
    || fail "$name: transient Codex reconnect status was not filtered"
  grep -Fq 'no\s+response\s+from\s+provider\s+for\s+\d+s' "$source/gateway/run.py" \
    || fail "$name: transient provider timeout status was not filtered"
  grep -Fq 'INFOBIZ_PRIVACY_SAFE_INBOUND_LOG' "$source/gateway/run.py" \
    || fail "$name: inbound user text was not removed from gateway logs"
  if grep -Fq 'msg=%r reply_to_id=%s reply_to_text=%r' "$source/gateway/run.py"; then
    fail "$name: gateway still logs inbound user content"
  fi
  "$PYTHON_BIN" - "$home" <<'PY'
import sys
from pathlib import Path
import yaml

home = Path(sys.argv[1])
for profile in ("default", "marketer", "copywriter", "designer", "tech"):
    root = home if profile == "default" else home / "profiles" / profile
    data = yaml.safe_load((root / "config.yaml").read_text(encoding="utf-8")) or {}
    model = data.get("model") or {}
    streaming = data.get("streaming") or {}
    display = data.get("display") or {}
    telegram = ((display.get("platforms") or {}).get("telegram") or {})

    assert model.get("provider") == "openai-codex", profile
    assert model.get("openai_runtime") == "auto", profile
    assert "api_mode" not in model, profile
    assert "context_length" not in model, profile
    assert streaming.get("enabled") is False, profile
    assert streaming.get("transport") == "off", profile
    assert display.get("streaming") is False, profile
    assert display.get("interim_assistant_messages") is False, profile
    assert display.get("tool_progress") == "off", profile
    assert display.get("long_running_notifications") is False, profile
    assert display.get("busy_ack_detail") is False, profile
    assert telegram.get("streaming") is False, profile
    assert telegram.get("tool_progress") == "off", profile
    assert telegram.get("long_running_notifications") is False, profile
    assert telegram.get("busy_ack_detail") is False, profile
    assert (data.get("compression") or {}).get("enabled") is not False, profile
    assert (data.get("memory") or {}).get("nudge_interval") != 0, profile
    assert (data.get("skills") or {}).get("creation_nudge_interval") != 0, profile
PY
  printf 'ok %s\n' "$name"
}

if [[ -n "${HERMES_SOURCE_ROOT:-}" ]]; then
  [[ -d "$HERMES_SOURCE_ROOT" ]] || fail "HERMES_SOURCE_ROOT does not exist"
  cp -R "$HERMES_SOURCE_ROOT" "$WORK/custom"
  patch_and_check custom
  exit 0
fi

metadata="$(curl -fsSL --max-time 20 "$HERMES_RELEASE_API" || true)"
release_url="$(printf '%s' "$metadata" | sed -nE 's/.*"tarball_url"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' | head -1)"
[[ -n "$release_url" ]] || release_url="https://github.com/NousResearch/hermes-agent/archive/refs/tags/$HERMES_FALLBACK_TAG.tar.gz"

fetch_source release "$release_url"
fetch_source main "https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.tar.gz"
for model in \
  gpt-5.6-sol gpt-5.6-sol-pro \
  gpt-5.6-terra gpt-5.6-terra-pro \
  gpt-5.6-luna gpt-5.6-luna-pro
do
  grep -Fq "\"$model\"" "$WORK/main/hermes_cli/codex_models.py" \
    || fail "Official Hermes main does not expose $model"
done
patch_and_check release
patch_and_check main

printf 'Hermes upstream compatibility smoke passed.\n'
