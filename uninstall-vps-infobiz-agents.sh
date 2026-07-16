#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
LOCAL_BIN="$HOME/.local/bin"
RESTORED_PREVIOUS_HERMES=0
UV_INSTALLED_PATH=""
NODE_INSTALLED_BY_INFOBIZ=0
if [[ -f "$INSTALL_ROOT/.uv-installed-by-infobiz" ]]; then
  UV_INSTALLED_PATH="$(head -n 1 "$INSTALL_ROOT/.uv-installed-by-infobiz" 2>/dev/null || true)"
fi
if [[ -f "$INSTALL_ROOT/.node-installed-by-infobiz" ]]; then
  NODE_INSTALLED_BY_INFOBIZ=1
else
  for command_name in node npm npx; do
    target="$(readlink "$LOCAL_BIN/$command_name" 2>/dev/null || true)"
    [[ "$target" == "$HERMES_ROOT/node/"* ]] && NODE_INSTALLED_BY_INFOBIZ=1
  done
fi
WEB_SHELL_PORT=8787
if [[ -f "$INSTALL_ROOT/vps.env" ]]; then
  detected_port="$(sed -n "s/^WEB_SHELL_PORT=['\"]\{0,1\}\([0-9][0-9]*\).*/\1/p" "$INSTALL_ROOT/vps.env" | tail -1)"
  [[ -n "$detected_port" ]] && WEB_SHELL_PORT="$detected_port"
fi

safe_managed_root() {
  local target resolved home_resolved
  target="$1"
  resolved="$(realpath -m "$target")"
  home_resolved="$(realpath -m "$HOME")"
  [[ -n "$resolved" && "$resolved" != "/" && "$resolved" != "$home_resolved" && "$resolved" == "$home_resolved"/* ]]
}

safe_managed_root "$INSTALL_ROOT" || {
  printf "ERROR: unsafe INSTALL_ROOT: %s\n" "$INSTALL_ROOT" >&2
  exit 1
}
safe_managed_root "$HERMES_ROOT" || {
  printf "ERROR: unsafe HERMES_ROOT: %s\n" "$HERMES_ROOT" >&2
  exit 1
}

say_step() {
  printf "==> %s\n" "$1"
}

remove_path() {
  local target="$1"
  if [[ -e "$target" || -L "$target" ]]; then
    rm -rf "$target"
    printf "removed %s\n" "$target"
  fi
}

is_restore_eligible_backup() {
  local candidate="$1" profile
  [[ -f "$candidate/.infobiz-restore-eligible" ]] && return 0
  [[ -d "$candidate/hermes-agent" ]] || return 1
  [[ "$(cat "$candidate/hermes-agent/.install_method" 2>/dev/null || true)" == "managed-runtime" ]] && return 1
  [[ -f "$candidate/hermes-agent/.infobiz-upstream-ref" ]] && return 1
  for profile in marketer copywriter designer tech; do
    [[ -d "$candidate/profiles/$profile" ]] && return 1
  done
  return 0
}

stop_disable_service() {
  local service="$1"
  systemctl stop "$service" >/dev/null 2>&1 || true
  systemctl disable "$service" >/dev/null 2>&1 || true
  remove_path "/etc/systemd/system/$service"
}

say_step "Stopping Infobiz systemd services"
for service in \
  infobiz-web-shell.service \
  infobiz-hermes-gateway.service \
  infobiz-hermes-gateway-designer.service \
  infobiz-hermes-gateway-copywriter.service \
  infobiz-hermes-gateway-marketer.service \
  infobiz-hermes-gateway-producer.service \
  infobiz-hermes-gateway-tech.service
do
  stop_disable_service "$service"
done
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl reset-failed >/dev/null 2>&1 || true
if command -v ufw >/dev/null 2>&1; then
  ufw --force delete allow "$WEB_SHELL_PORT/tcp" >/dev/null 2>&1 || true
fi

say_step "Stopping leftover processes"
pkill -f "$INSTALL_ROOT" >/dev/null 2>&1 || true
pkill -f "$HERMES_ROOT/hermes-agent" >/dev/null 2>&1 || true
pkill -f "web-shell/server.mjs" >/dev/null 2>&1 || true
pkill -f "hermes.*gateway run" >/dev/null 2>&1 || true
pkill -f "hermes_cli.*gateway" >/dev/null 2>&1 || true

say_step "Removing installed app, Hermes, profiles, runtimes, logs, and config"
remove_path "$INSTALL_ROOT"
remove_path "$HERMES_ROOT"
latest_backup=""
while IFS= read -r candidate; do
  [[ -n "$candidate" && -d "$candidate" ]] || continue
  if is_restore_eligible_backup "$candidate"; then
    latest_backup="$candidate"
    break
  fi
done < <(find "$HOME" -maxdepth 1 -type d -name '.hermes.backup.*' -print | sort -r)
if [[ -n "$latest_backup" && -d "$latest_backup" ]]; then
  mv "$latest_backup" "$HERMES_ROOT"
  RESTORED_PREVIOUS_HERMES=1
  printf "restored previous Hermes from %s\n" "$latest_backup"
fi

say_step "Removing command shims"
remove_path "$LOCAL_BIN/hermes"
remove_path "$LOCAL_BIN/hermes-agent"
remove_path "$LOCAL_BIN/tirith"
if [[ "$NODE_INSTALLED_BY_INFOBIZ" == "1" ]]; then
  remove_path "$LOCAL_BIN/node"
  remove_path "$LOCAL_BIN/npm"
  remove_path "$LOCAL_BIN/npx"
fi

case "$UV_INSTALLED_PATH" in
  "$HOME/.local/bin/uv"|"$HOME/.cargo/bin/uv")
    remove_path "$UV_INSTALLED_PATH"
    remove_path "${UV_INSTALLED_PATH%/uv}/uvx"
    ;;
esac

if [[ "$RESTORED_PREVIOUS_HERMES" == "1" ]]; then
  mkdir -p "$LOCAL_BIN"
  [[ -x "$HERMES_ROOT/hermes-agent/venv/bin/hermes" ]] && ln -sf "$HERMES_ROOT/hermes-agent/venv/bin/hermes" "$LOCAL_BIN/hermes"
  for command_name in node npm npx; do
    [[ -x "$HERMES_ROOT/node/bin/$command_name" ]] && ln -sf "$HERMES_ROOT/node/bin/$command_name" "$LOCAL_BIN/$command_name"
  done
fi

say_step "Done"
printf "All Infobiz Agents / Hermes VPS installer artifacts were removed.\n"
