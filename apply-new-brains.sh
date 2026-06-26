#!/bin/zsh
set -euo pipefail

# apply-new-brains.sh
# Накатывает ТОЛЬКО свежие мозги агентов (SOUL / IDENTITY / AGENTS / knowledge /
# curated skills) на уже установленный Infobiz-пак.
#
# Что НЕ трогает: память (memories/), сессии (sessions/), ключи (.env, auth.json),
# config.yaml, state.db, кэши, cron, сидовые Hermes-скиллы, WebShell.
#
# Накат идёт overlay-ом (rsync без --delete): перезаписываются только мозговые
# файлы, всё остальное в профиле остаётся как было. Перед накатом — бэкап мозгов.
#
# Использование:
#   /bin/zsh apply-new-brains.sh                  # берёт dist/infobiz-agent-profile-marketer-<VER>.tar.gz
#   /bin/zsh apply-new-brains.sh /path/to.tar.gz  # явный путь к пакету мозгов
#   DRY_RUN=1 /bin/zsh apply-new-brains.sh         # показать что будет, ничего не менять

VERSION="${VERSION:-0.1.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HERMES_ROOT="${HERMES_HOME:-$HOME/.hermes}"
PROFILES=(marketer copywriter designer tech)
DRY_RUN="${DRY_RUN:-0}"
BASE_URL="${BASE_URL:-https://github.com/temaserditov/infobiz-agents-installer/releases/download/v$VERSION}"

say()  { printf "\033[1m==> %s\033[0m\n" "$1"; }
fail() { printf "ОШИБКА: %s\n" "$1" >&2; exit 1; }

[[ -d "$HERMES_ROOT/profiles" ]] || fail "Hermes-пак не установлен — нет $HERMES_ROOT/profiles
Сначала поставь пак полным установщиком, потом накатывай мозги."

# Рабочая папка
WORK="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/infobiz-brains.XXXXXX")"
trap '/bin/rm -rf "$WORK"' EXIT

# 1) Найти пакет мозгов: явный путь / env / локальный dist / скачать из релиза
PAYLOAD="${1:-${PAYLOAD:-$SCRIPT_DIR/dist/infobiz-agent-profile-marketer-$VERSION.tar.gz}}"
if [[ ! -f "$PAYLOAD" ]]; then
  url="$BASE_URL/infobiz-agent-profile-marketer-$VERSION.tar.gz"
  say "Локального пакета нет — качаю из релиза: $url"
  PAYLOAD="$WORK/payload.tar.gz"
  /usr/bin/curl -fsSL "$url" -o "$PAYLOAD" \
    || fail "Не удалось скачать пакет мозгов: $url
Проверь интернет/доступ к релизу или передай путь к .tar.gz аргументом."
fi

say "Пакет мозгов: $PAYLOAD"
say "Hermes:       $HERMES_ROOT"
[[ "$DRY_RUN" == "1" ]] && say "РЕЖИМ DRY-RUN — ничего не меняю, только показываю"

# 2) Распаковать пакет
/usr/bin/tar -xzf "$PAYLOAD" -C "$WORK" || fail "Не удалось распаковать пакет: $PAYLOAD"
SRC="$WORK/profile/agents"
[[ -d "$SRC" ]] || fail "Битый пакет: нет profile/agents"

# Что НЕ перезаписываем в профиле (user-data + runtime)
EXCL=(--exclude '.env' --exclude '.env.EXAMPLE' --exclude 'auth.json' --exclude 'auth.lock' \
      --exclude 'config.yaml' --exclude 'sessions/' --exclude 'memories/' --exclude 'logs/' \
      --exclude 'cache/' --exclude 'audio_cache/' --exclude 'image_cache/' --exclude 'document_cache/' \
      --exclude 'cron/' --exclude 'hooks/' --exclude 'pairing/' --exclude 'sandboxes/' \
      --exclude 'state.db' --exclude 'state.db-shm' --exclude 'state.db-wal' \
      --exclude 'gateway.pid' --exclude 'gateway.lock' --exclude 'gateway_state.json' \
      --exclude '.skills_prompt_snapshot.json' --exclude 'models_dev_cache.json' \
      --exclude 'channel_directory.json' --exclude '.DS_Store')

RSYNC_FLAGS=(-a)
[[ "$DRY_RUN" == "1" ]] && RSYNC_FLAGS=(-ain)

STAMP="$(/bin/date +%Y%m%d%H%M%S)"
updated=()

# 3) Накатить мозги по ролям
for role in "${PROFILES[@]}"; do
  src="$SRC/$role"
  dst="$HERMES_ROOT/profiles/$role"
  [[ -d "$src" ]] || { printf "  пропуск %s — нет в пакете\n" "$role"; continue; }
  [[ -d "$dst" ]] || { printf "  пропуск %s — профиль не установлен (%s)\n" "$role" "$dst"; continue; }

  if [[ "$DRY_RUN" != "1" ]]; then
    # лёгкий бэкап мозгового ядра (корневые *.md + knowledge/)
    bak="$HERMES_ROOT/.archives/brains-$role.$STAMP"
    /bin/mkdir -p "$bak"
    /usr/bin/rsync -a --prune-empty-dirs \
      --include '*/' --include '*.md' --include 'knowledge/***' --exclude '*' \
      "$dst/" "$bak/" >/dev/null 2>&1 || true
  fi

  printf "  мозги -> %s\n" "$role"
  /usr/bin/rsync "${RSYNC_FLAGS[@]}" "${EXCL[@]}" "$src/" "$dst/" | sed 's/^/      /'
  /usr/bin/xattr -dr com.apple.quarantine "$dst" >/dev/null 2>&1 || true
  updated+=("$role")
done

[[ ${#updated[@]} -gt 0 ]] || fail "Ни один профиль не обновлён — проверь, что пак установлен."

# 4) Перезапустить гейтвеи, чтобы новые SOUL подхватились в свежих сессиях
if [[ "$DRY_RUN" == "1" ]]; then
  say "DRY-RUN — гейтвеи НЕ перезапускаю. Реальный запуск: /bin/zsh $0"
  exit 0
fi

say "Перезапуск гейтвеев"
uid="$(/usr/bin/id -u)"
for role in "${updated[@]}"; do
  label="ai.hermes.gateway-$role"
  if /bin/launchctl kickstart -k "gui/$uid/$label" >/dev/null 2>&1; then
    printf "  рестарт: %s (launchd)\n" "$role"
  elif command -v hermes >/dev/null 2>&1 && hermes -p "$role" gateway restart >/dev/null 2>&1; then
    printf "  рестарт: %s (hermes)\n" "$role"
  else
    printf "  гейтвей %s не перезапущен автоматически — перезапусти вручную\n" "$role"
  fi
done

say "Готово. Обновлены мозги: ${updated[*]}"
printf "Память, сессии и ключи сохранены. Бэкап мозгов: %s/.archives/brains-*.%s\n" "$HERMES_ROOT" "$STAMP"
printf "Примечание: диспетчер Hermes (%s/SOUL.md) этот патч не трогает.\n" "$HERMES_ROOT"
