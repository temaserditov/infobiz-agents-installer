#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT/install-vps-infobiz-agents.sh"
UPDATER="$ROOT/update-vps-infobiz-agents.sh"
TEST_TMP="$(mktemp -d "${TMPDIR:-/tmp}/infobiz-vps-progress-test.XXXXXX")"

cleanup() {
  if [[ -n "${TEST_TMP:-}" && -d "$TEST_TMP" ]]; then
    rm -R -- "$TEST_TMP"
  fi
}
trap cleanup EXIT

fail_test() {
  printf "FAIL: %s\n" "$1" >&2
  exit 1
}

pass_test() {
  printf "OK: %s\n" "$1"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  grep -Fq -- "$pattern" "$file" || fail_test "$label"
  pass_test "$label"
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -Fq -- "$pattern" "$file"; then
    fail_test "$label"
  fi
  pass_test "$label"
}

assert_output_contains() {
  local output="$1"
  local pattern="$2"
  local label="$3"
  printf '%s' "$output" | grep -Fq -- "$pattern" || fail_test "$label"
  pass_test "$label"
}

assert_output_matches() {
  local output="$1"
  local pattern="$2"
  local label="$3"
  printf '%s' "$output" | grep -Eq -- "$pattern" || fail_test "$label"
  pass_test "$label"
}

terminal_fixture() {
  local candidate
  for candidate in /dev/pts/ptmx /dev/pts/[0-9]* /dev/ttyp? /dev/ttyq? /dev/ttys?; do
    [[ -e "$candidate" && -r "$candidate" ]] || continue
    if (: < "$candidate") 2>/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# Run a command with a hard deadline without relying on GNU timeout, which is
# not installed by default on macOS and cannot directly invoke shell functions.
run_bounded() {
  local output_file="$1"
  local limit_seconds="$2"
  shift 2

  "$@" > "$output_file" 2>&1 &
  local pid=$!
  local waited_ticks=0
  local limit_ticks=$((limit_seconds * 10))
  while kill -0 "$pid" >/dev/null 2>&1; do
    if (( waited_ticks >= limit_ticks )); then
      if command -v pkill >/dev/null 2>&1; then
        pkill -TERM -P "$pid" >/dev/null 2>&1 || true
      fi
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 0.1
    waited_ticks=$((waited_ticks + 1))
  done

  wait "$pid"
}

profile_session_name() {
  local profile_url="$1"
  local case_root="$2"
  HOME="$case_root/home" \
  INSTALL_ROOT="$case_root/install" \
  TMPDIR="$case_root/tmp" \
  PROFILE_URL="$profile_url" \
    bash -c '
      set -euo pipefail
      INFOBIZ_INSTALLER_LIBRARY_ONLY=1
      source "$1"
      trap - ERR EXIT
      printf "%s\n" "$TMUX_SESSION_NAME"
    ' _ "$INSTALLER"
}

run_tmux_case() {
  local case_root="$1"
  local inner_exit_code="$2"
  local tmux_client_exit_code="$3"
  local terminal_path="$4"
  local session_exists="${5:-0}"

  mkdir -p "$case_root/home" "$case_root/install" "$case_root/tmp"
  HOME="$case_root/home" \
  INSTALL_ROOT="$case_root/install" \
  TMPDIR="$case_root/tmp" \
  PROFILE_URL="https://example.test/profile.tar.gz?case=$inner_exit_code" \
  WEB_SHELL_URL="https://example.test/web-shell.tar.gz" \
  MOCK_INNER_EXIT_CODE="$inner_exit_code" \
  MOCK_TMUX_CLIENT_EXIT_CODE="$tmux_client_exit_code" \
  MOCK_TERMINAL_PATH="$terminal_path" \
  MOCK_SESSION_EXISTS="$session_exists" \
  MOCK_COPY_TRACE="$case_root/copy.trace" \
    bash -c '
      set -euo pipefail
      export MOCK_INNER_EXIT_CODE MOCK_TMUX_CLIENT_EXIT_CODE MOCK_TERMINAL_PATH
      export MOCK_SESSION_EXISTS MOCK_COPY_TRACE
      INFOBIZ_INSTALLER_LIBRARY_ONLY=1
      source "$1"
      trap - ERR EXIT
      unset INFOBIZ_INSTALLER_LIBRARY_ONLY

      # The production function copies itself before entering tmux. For this
      # isolated test, replace that copy with a deterministic inner installer.
      cp() {
        printf "called\n" >> "$MOCK_COPY_TRACE"
        printf "%s\n" \
          "#!/usr/bin/env bash" \
          "exit \"\${MOCK_INNER_EXIT_CODE:-0}\"" > "$2"
      }

      # Force the real ensure_tmux_session terminal branch without depending
      # on whether the test runner itself owns a TTY.
      readlink() {
        printf "%s\n" "$MOCK_TERMINAL_PATH"
      }

      # Execute the exact command assembled by ensure_tmux_session, then make
      # the tmux client status deliberately independent from the inner status.
      tmux() {
        case "${1:-}" in
          new-session)
            if [[ "$MOCK_SESSION_EXISTS" == "1" ]]; then
              printf "0\n" > "$INSTALL_ROOT/.${TMUX_SESSION_NAME}.status"
              return "$MOCK_TMUX_CLIENT_EXIT_CODE"
            fi
            local command_string="${!#}"
            bash -c "$command_string"
            return "$MOCK_TMUX_CLIENT_EXIT_CODE"
            ;;
          has-session)
            [[ "$MOCK_SESSION_EXISTS" == "1" ]]
            return
            ;;
          *)
            return 1
            ;;
        esac
      }

      ensure_tmux_session
    ' _ "$INSTALLER"
}

bash -n "$INSTALLER"
bash -n "$UPDATER"
bash -n "${BASH_SOURCE[0]}"

assert_contains "$INSTALLER" 'if [[ "${INFOBIZ_INSTALLER_LIBRARY_ONLY:-0}" != "1" ]]; then' \
  "installer can be sourced without running main"
assert_contains "$INSTALLER" 'status_tmp="${status_file}.tmp.$$"' \
  "tmux command records the inner installer status atomically"
assert_contains "$INSTALLER" 'installer_exit_code="$(head -n 1 "$status_file"' \
  "outer process reads the recorded installer status"
assert_contains "$INSTALLER" 'mv -f "$stable_tmp" "$stable_script"' \
  "resumable installer is replaced atomically"
assert_contains "$INSTALLER" 'flock -n 9' \
  "installer mutations are protected by an install-wide lock"
assert_not_contains "$INSTALLER" ': > "$LOG_FILE"' \
  "retry cannot truncate the running installer log"
assert_not_contains "$INSTALLER" 'Нажмите Enter, чтобы вернуться в консоль' \
  "tmux result screen has no Enter prompt"
assert_contains "$UPDATER" 'UPDATE_PROGRESS_TOTAL=16' \
  "updater owns a real progress scale"
assert_contains "$UPDATER" 'flock -n 9' \
  "standalone updater shares the install-wide lock"
assert_contains "$INSTALLER" 'INFOBIZ_INSTALL_LOCK_HELD=1' \
  "nested safe updater reuses the parent install lock"
assert_contains "$UPDATER" 'UPDATE_PROGRESS_START + UPDATE_PROGRESS_STEP * (UPDATE_PROGRESS_END - UPDATE_PROGRESS_START)' \
  "updater maps its stages into the caller progress range"

progress_output="$({
  HOME="$TEST_TMP/progress-home" \
  INSTALL_ROOT="$TEST_TMP/progress-install" \
  TMPDIR="$TEST_TMP/progress-tmp" \
    bash -c '
      set -euo pipefail
      INFOBIZ_INSTALLER_LIBRARY_ONLY=1
      source "$1"
      trap - ERR EXIT
      PROGRESS_STEP=0
      PROGRESS_TOTAL=11
      progress_stage "Подготовка терминала"
    ' _ "$INSTALLER"
} 2>&1)"
assert_output_contains "$progress_output" "Подготовка терминала" \
  "first progress stage renders its label"
assert_output_matches "$progress_output" '] [1-9][0-9]*%' \
  "first progress stage is greater than zero percent"

partial_root="$TEST_TMP/partial-install"
mkdir -p "$partial_root/home/.hermes/hermes-agent" \
  "$partial_root/home/.hermes/profiles"/{marketer,copywriter,designer,tech} \
  "$partial_root/install"
if HOME="$partial_root/home" \
  HERMES_ROOT="$partial_root/home/.hermes" \
  INSTALL_ROOT="$partial_root/install" \
  TMPDIR="$partial_root/tmp" \
    bash -c '
      set -euo pipefail
      INFOBIZ_INSTALLER_LIBRARY_ONLY=1
      source "$1"
      trap - ERR EXIT
      is_infobiz_managed_install
    ' _ "$INSTALLER"
then
  fail_test "partial profile extraction must not be treated as a completed install"
fi
pass_test "partial profile extraction is not treated as a completed install"

mkdir -p "$partial_root/install/web-shell"
: > "$partial_root/install/web-shell/server.mjs"
printf '%s\n' 'http://127.0.0.1:8787/?token=test' > "$partial_root/install/web-shell.url"
printf '%s\n' "WEB_SHELL_PORT='8787'" > "$partial_root/install/vps.env"
: > "$partial_root/install/.install-complete"
HOME="$partial_root/home" \
HERMES_ROOT="$partial_root/home/.hermes" \
INSTALL_ROOT="$partial_root/install" \
TMPDIR="$partial_root/tmp" \
  bash -c '
    set -euo pipefail
    INFOBIZ_INSTALLER_LIBRARY_ONLY=1
    source "$1"
    trap - ERR EXIT
    is_infobiz_managed_install
  ' _ "$INSTALLER" \
  || fail_test "completed install marker is not recognized"
pass_test "completed install marker is recognized"

mkdir -p "$TEST_TMP/session-a" "$TEST_TMP/session-b"
session_a="$(profile_session_name \
  'https://example.test/profile.tar.gz?token=first' "$TEST_TMP/session-a")"
session_b="$(profile_session_name \
  'https://example.test/profile.tar.gz?token=second' "$TEST_TMP/session-a")"
session_c="$(profile_session_name \
  'https://example.test/profile.tar.gz?token=first' "$TEST_TMP/session-b")"
[[ "$session_a" == infobiz-agents-install-v2-* ]] \
  || fail_test "generated tmux session has the managed prefix"
[[ "$session_a" == "$session_b" ]] \
  || fail_test "new LMS tokens reuse the install-wide tmux session"
[[ "$session_a" != "$session_c" ]] \
  || fail_test "different install roots get isolated tmux sessions"
pass_test "tmux session identity is stable per install root"

terminal_path="$(terminal_fixture)" \
  || fail_test "no readable pseudo-terminal device is available for the tmux harness"

success_root="$TEST_TMP/tmux-success"
success_output="$TEST_TMP/tmux-success.out"
set +e
run_bounded "$success_output" 8 \
  run_tmux_case "$success_root" 0 97 "$terminal_path"
success_status=$?
set -e
[[ "$success_status" == "0" ]] \
  || fail_test "successful inner installer returns outer status 0 (got $success_status)"
pass_test "successful inner installer returns outer status 0"
assert_contains "$success_output" "Установка завершена." \
  "successful inner installer reaches the outer success screen"
assert_not_contains "$success_output" "Нажмите Enter" \
  "successful tmux flow finishes without waiting for Enter"

attach_root="$TEST_TMP/tmux-attach"
attach_output="$TEST_TMP/tmux-attach.out"
set +e
run_bounded "$attach_output" 8 \
  run_tmux_case "$attach_root" 0 71 "$terminal_path" 1
attach_status=$?
set -e
[[ "$attach_status" == "0" ]] \
  || fail_test "existing tmux session returns its recorded status (got $attach_status)"
[[ ! -e "$attach_root/copy.trace" ]] \
  || fail_test "attach path must not overwrite the running installer"
pass_test "existing tmux session attaches without overwriting its installer"

failure_root="$TEST_TMP/tmux-failure"
failure_output="$TEST_TMP/tmux-failure.out"
set +e
run_bounded "$failure_output" 8 \
  run_tmux_case "$failure_root" 23 0 "$terminal_path"
failure_status=$?
set -e
[[ "$failure_status" == "23" ]] \
  || fail_test "inner installer status 23 propagates to outer process (got $failure_status)"
pass_test "inner installer status 23 propagates to outer process"
assert_contains "$failure_output" "Установка завершилась с ошибкой." \
  "failed inner installer reaches the outer error screen"
assert_not_contains "$failure_output" "Установка завершена." \
  "failed inner installer never prints outer success"
assert_not_contains "$failure_output" "Нажмите Enter" \
  "failed tmux flow finishes without waiting for Enter"

printf "VPS installer progress smoke: PASS\n"
