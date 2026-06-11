#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"

INSTALL_ROOT="$HOME/InfobizAgents"
CONFIG_DIR="$HOME/.infobiz-agents"
HERMES_ROOT="$HOME/.hermes"
LOCAL_BIN="$HOME/.local/bin"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

say_step() {
  printf "==> %s\n" "$1"
}

remove_path() {
  local target="$1"
  if [[ -e "$target" || -L "$target" ]]; then
    /bin/rm -rf "$target"
    printf "removed %s\n" "$target"
  fi
}

bootout_plist() {
  local plist="$1"
  [[ -e "$plist" ]] || return 0
  /bin/launchctl bootout "gui/$(/usr/bin/id -u)" "$plist" >/dev/null 2>&1 || true
}

say_step "Stopping launchd services"
for plist in \
  "$LAUNCH_AGENTS"/com.infobiz.agents*.plist \
  "$LAUNCH_AGENTS"/ai.hermes.gateway*.plist
do
  bootout_plist "$plist"
done

/bin/launchctl remove com.infobiz.agents.web-shell >/dev/null 2>&1 || true
/bin/launchctl remove ai.hermes.gateway >/dev/null 2>&1 || true
/bin/launchctl remove ai.hermes.gateway-marketer >/dev/null 2>&1 || true

say_step "Stopping leftover processes"
/usr/bin/pkill -f "$INSTALL_ROOT" >/dev/null 2>&1 || true
/usr/bin/pkill -f "$HERMES_ROOT/hermes-agent" >/dev/null 2>&1 || true
/usr/bin/pkill -f "agent-web-shell/server.mjs" >/dev/null 2>&1 || true
/usr/bin/pkill -f "progress-server.mjs" >/dev/null 2>&1 || true
/usr/bin/pkill -f "hermes_cli.main.*gateway" >/dev/null 2>&1 || true
/usr/bin/pkill -f "gateway run" >/dev/null 2>&1 || true

say_step "Removing LaunchAgents"
for plist in \
  "$LAUNCH_AGENTS"/com.infobiz.agents*.plist \
  "$LAUNCH_AGENTS"/ai.hermes.gateway*.plist
do
  remove_path "$plist"
done

say_step "Removing installed app, bundled Node, bundled Python, logs, and config"
remove_path "/Applications/Infobiz Agents.app"
remove_path "$HOME/Applications/Infobiz Agents.app"
remove_path "$INSTALL_ROOT"
remove_path "$CONFIG_DIR"

say_step "Removing Hermes installed by test installers"
remove_path "$HERMES_ROOT"
for backup in "$HOME"/.hermes.backup.*; do
  remove_path "$backup"
done

say_step "Removing Hermes command shims created by installers"
remove_path "$LOCAL_BIN/hermes"
remove_path "$LOCAL_BIN/hermes-agent"
remove_path "$LOCAL_BIN/tirith"

say_step "Removing old DMG quarantine leftovers"
/usr/bin/xattr -dr com.apple.quarantine "$INSTALL_ROOT" "$CONFIG_DIR" "$HERMES_ROOT" >/dev/null 2>&1 || true
/usr/bin/xattr -dr com.apple.provenance "$INSTALL_ROOT" "$CONFIG_DIR" "$HERMES_ROOT" >/dev/null 2>&1 || true

say_step "Done"
printf "All Infobiz Agents / test Hermes installer artifacts were removed.\n"
