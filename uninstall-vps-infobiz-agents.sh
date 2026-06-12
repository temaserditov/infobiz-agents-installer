#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-$HOME/InfobizAgents}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
LOCAL_BIN="$HOME/.local/bin"

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

say_step "Stopping leftover processes"
pkill -f "$INSTALL_ROOT" >/dev/null 2>&1 || true
pkill -f "$HERMES_ROOT/hermes-agent" >/dev/null 2>&1 || true
pkill -f "web-shell/server.mjs" >/dev/null 2>&1 || true
pkill -f "hermes.*gateway run" >/dev/null 2>&1 || true
pkill -f "hermes_cli.*gateway" >/dev/null 2>&1 || true

say_step "Removing installed app, Hermes, profiles, runtimes, logs, and config"
remove_path "$INSTALL_ROOT"
remove_path "$HERMES_ROOT"
for backup in "$HOME"/.hermes.backup.* "$HOME"/.hermes.profile-*.backup.*; do
  remove_path "$backup"
done

say_step "Removing command shims"
remove_path "$LOCAL_BIN/hermes"
remove_path "$LOCAL_BIN/hermes-agent"
remove_path "$LOCAL_BIN/tirith"
remove_path "$LOCAL_BIN/node"
remove_path "$LOCAL_BIN/npm"
remove_path "$LOCAL_BIN/npx"

say_step "Done"
printf "All Infobiz Agents / Hermes VPS installer artifacts were removed.\n"
