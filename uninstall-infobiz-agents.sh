#!/bin/zsh
set -euo pipefail
setopt NULL_GLOB
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"

INSTALL_ROOT="$HOME/InfobizAgents"
CONFIG_DIR="$HOME/.infobiz-agents"
HERMES_ROOT="$HOME/.hermes"
LOCAL_BIN="$HOME/.local/bin"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
RESTORED_PREVIOUS_HERMES=0
UV_INSTALLED_PATH=""
NODE_INSTALLED_BY_INFOBIZ=0
if [[ -f "$INSTALL_ROOT/.uv-installed-by-infobiz" ]]; then
  UV_INSTALLED_PATH="$(/usr/bin/head -n 1 "$INSTALL_ROOT/.uv-installed-by-infobiz" 2>/dev/null || true)"
fi
if [[ -f "$INSTALL_ROOT/.node-installed-by-infobiz" ]]; then
  NODE_INSTALLED_BY_INFOBIZ=1
else
  for command_name in node npm npx; do
    target="$(/usr/bin/readlink "$LOCAL_BIN/$command_name" 2>/dev/null || true)"
    [[ "$target" == "$HERMES_ROOT/node/"* ]] && NODE_INSTALLED_BY_INFOBIZ=1
  done
fi

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

is_restore_eligible_backup() {
  local candidate="$1" profile
  [[ -f "$candidate/.infobiz-restore-eligible" ]] && return 0
  [[ -d "$candidate/hermes-agent" ]] || return 1
  [[ "$(/bin/cat "$candidate/hermes-agent/.install_method" 2>/dev/null || true)" == "managed-runtime" ]] && return 1
  [[ -f "$candidate/hermes-agent/.infobiz-upstream-ref" ]] && return 1
  for profile in marketer copywriter designer tech; do
    [[ -d "$candidate/profiles/$profile" ]] && return 1
  done
  return 0
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
remove_path "/Applications/HERMES.app"
remove_path "$HOME/Applications/HERMES.app"
remove_path "$INSTALL_ROOT"
remove_path "$CONFIG_DIR"

say_step "Removing Hermes installed by test installers"
remove_path "$HERMES_ROOT"
latest_backup=""
while IFS= read -r candidate; do
  [[ -n "$candidate" && -d "$candidate" ]] || continue
  if is_restore_eligible_backup "$candidate"; then
    latest_backup="$candidate"
    break
  fi
done < <(/usr/bin/find "$HOME" -maxdepth 1 -type d -name '.hermes.backup.*' -print | /usr/bin/sort -r)
if [[ -n "$latest_backup" && -d "$latest_backup" ]]; then
  /bin/mv "$latest_backup" "$HERMES_ROOT"
  RESTORED_PREVIOUS_HERMES=1
  printf "restored previous Hermes from %s\n" "$latest_backup"
fi

say_step "Removing Hermes command shims created by installers"
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
  /bin/mkdir -p "$LOCAL_BIN"
  [[ -x "$HERMES_ROOT/hermes-agent/venv/bin/hermes" ]] && /bin/ln -sf "$HERMES_ROOT/hermes-agent/venv/bin/hermes" "$LOCAL_BIN/hermes"
  for command_name in node npm npx; do
    [[ -x "$HERMES_ROOT/node/bin/$command_name" ]] && /bin/ln -sf "$HERMES_ROOT/node/bin/$command_name" "$LOCAL_BIN/$command_name"
  done
fi

say_step "Removing old DMG quarantine leftovers"
/usr/bin/xattr -dr com.apple.quarantine "$INSTALL_ROOT" "$CONFIG_DIR" "$HERMES_ROOT" >/dev/null 2>&1 || true
/usr/bin/xattr -dr com.apple.provenance "$INSTALL_ROOT" "$CONFIG_DIR" "$HERMES_ROOT" >/dev/null 2>&1 || true

say_step "Removing PATH entries added by installers"
for rc in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  [[ -f "$rc" && ! -L "$rc" ]] || continue
  if /usr/bin/grep -Fq 'Infobiz Agents: ensure' "$rc" 2>/dev/null; then
    rc_tmp="$(/usr/bin/mktemp "$rc.infobiz.XXXXXX")"
    /usr/bin/awk '
      $0 == "# Infobiz Agents: ensure ~/.local/bin (hermes) on PATH" { next }
      $0 == "export PATH=\"$HOME/.local/bin:$PATH\"" { next }
      { print }
    ' "$rc" > "$rc_tmp"
    /bin/chmod "$(/usr/bin/stat -f '%Lp' "$rc")" "$rc_tmp"
    /bin/mv "$rc_tmp" "$rc"
    printf "cleaned PATH entry from %s\n" "$rc"
  fi
done

say_step "Done"
printf "All Infobiz Agents / test Hermes installer artifacts were removed.\n"
