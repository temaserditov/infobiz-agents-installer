# Диагностика по симптомам

## Установка «зависла»

1. Убедитесь, что установщик не ждёт OAuth-код или завершения входа в OpenAI.
2. На VPS OAuth выполняется в браузере компьютера или телефона. Браузер не обязан
   открываться на сервере.
3. Проверьте свежие строки, не запуская вторую копию установщика:

```bash
tail -n 120 "$HOME/InfobizAgents/install.log"
```

4. Найдите активный процесс:

```bash
ps -axo pid,etime,command | rg 'install|setup-hermes|uv|python|node|tar|curl'
```

Большая распаковка или установка зависимостей может некоторое время не менять
видимый прогресс. Отсутствие вывода само по себе не доказывает зависание.

## OAuth на VPS

- Откройте показанный URL на своём компьютере или телефоне.
- Введите device code из терминала.
- Вернитесь в терминал VPS и дождитесь продолжения.
- Не вставляйте callback URL в другой локальный терминал, если установщик ждёт
  device code.
- Не копируйте `auth.json` с чужого компьютера.

Проверка после установки:

```bash
HERMES="$HOME/.local/bin/hermes"
test -x "$HERMES" || HERMES="$HOME/.hermes/hermes-agent/venv/bin/hermes"
"$HERMES" auth status openai-codex
```

Если авторизация есть, но конкретная модель отклоняется, это может быть ограничение
аккаунта, а не поломка OAuth. Выберите доступную модель через WebShell.

## Windows не подключается к VPS

Самый устойчивый путь для нетехнического пользователя — браузерная Serial Console
или VNC-консоль в панели хостинга. Она не зависит от PowerShell, разрядности Windows,
наличия OpenSSH и настроек локальной сети.

Если используется SSH:

- логин и IP берутся целиком из панели хостинга;
- `root` подходит только когда хостинг разрешил вход root;
- пароль при вводе не отображается — это нормально;
- повторный запрос пароля означает, что сервер не принял реквизиты;
- подтверждение host key относится к первому подключению и не является ошибкой;
- `Permission denied` диагностируется на стороне SSH/VPS, а не переустановкой Hermes.

Не вставляйте bash-синтаксис `bash <(...)` непосредственно в PowerShell.

## WebShell не открывается

### Mac

```bash
cat "$HOME/InfobizAgents/webshell-url.txt" 2>/dev/null || cat "$HOME/InfobizAgents/web-shell.url"
launchctl print "gui/$(id -u)/com.infobiz.agents.web-shell"
tail -n 120 "$HOME/InfobizAgents/web-shell.err.log"
launchctl kickstart -k "gui/$(id -u)/com.infobiz.agents.web-shell"
```

### VPS

```bash
systemctl status infobiz-web-shell.service --no-pager -l
journalctl -u infobiz-web-shell.service -n 150 --no-pager
ss -ltnp | rg ':8787\b'
```

Если локально на VPS панель отвечает, а публично нет, проверяйте firewall, security
group хостинга, публичный IPv4 и правильность порта. Не отключайте firewall целиком.

## Один gateway упал

Проверьте только этот профиль. Пример для Дизайнера:

### Mac

```bash
tail -n 160 "$HOME/.hermes/profiles/designer/logs/gateway.log"
launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway-designer"
```

### VPS

```bash
journalctl -u infobiz-hermes-gateway-designer.service -n 160 --no-pager
systemctl restart infobiz-hermes-gateway-designer.service
systemctl is-active infobiz-hermes-gateway-designer.service
```

Если сервис сразу снова падает, не запускайте бесконечный restart loop. Найдите
первый traceback или config/auth error.

## Упали все агенты

Проверьте в таком порядке:

1. Есть ли место: `df -h` и `df -i`.
2. Работает ли сеть и DNS.
3. Существует ли Hermes venv и CLI.
4. Что показывает `hermes doctor`.
5. Действительна ли авторизация `openai-codex`.
6. Не обновлялся ли runtime непосредственно перед падением.
7. Состояние всех launchd/systemd services.

Не удаляйте `~/.hermes`: там находятся авторизация, профили, память и сессии.

## Telegram-бот не отвечает

В WebShell проверьте для нужного агента:

- токен сохранён;
- разрешён хотя бы один Telegram ID;
- gateway находится в рабочем состоянии;
- одна и та же строка Bot Token не используется одновременно несколькими gateway.

Сохранение токена или ID в WebShell должно само перезапускать нужный gateway.
Ручной restart нужен только если автоматический перезапуск завершился ошибкой.

В логах различайте:

- `Unauthorized` — неверный/отозванный Bot Token;
- `Conflict` или другой активный `getUpdates` — этот токен уже использует другой процесс;
- network timeout к Telegram — DNS, VPN, firewall или проблема сети;
- сообщение игнорируется при живом gateway — Telegram ID не разрешён.

## Provider authentication failed

1. Проверьте `hermes auth status openai-codex` в главном профиле.
2. Сравните ошибку одного профиля и остальных.
3. Если не работает только один профиль, проверьте его `HERMES_HOME`, модель и
   доступ к общей авторизации, не копируя auth-файлы вручную.
4. Если не работают все, повторите официальный OAuth через поддерживаемый flow.
5. После изменения перезапустите только затронутые gateway.

Не подменяйте provider API-ключом, если продукт настроен на OpenAI/Codex OAuth.

## Model provider failed after retries

Это общий финальный симптом. Причина находится выше в gateway log. Ищите:

- authentication/credential failure;
- model not found или model access denied;
- timeout/no events;
- DNS/TLS/connect failure;
- переполненный контекст;
- некорректную конфигурацию конкретного профиля.

Не увеличивайте таймаут вслепую. Сначала установите, был ли запрос вообще принят
провайдером. Если модель недоступна аккаунту, выберите доступную в WebShell.

## `hermes: command not found` или сломан Python venv

Используйте управляемый launcher:

```bash
test -x "$HOME/.local/bin/hermes" && "$HOME/.local/bin/hermes" --version
test -x "$HOME/.hermes/hermes-agent/venv/bin/hermes" && "$HOME/.hermes/hermes-agent/venv/bin/hermes" --version
```

Если второй путь работает, проблема только в PATH/симлинке. Не ставьте другой
Python глобально. Если не работает и venv, используйте актуальный Infobiz-апдейтер,
который заново применяет официальный setup Hermes и наш слой.

## Ошибки загрузки

- `curl (6)`: DNS не разрешил имя.
- `curl (7)`: соединение с хостом/портом не установлено.
- `curl (22)`: сервер вернул HTTP-ошибку; проверьте право доступа и срок токена.
- `curl (23)`: запись локального файла не удалась; проверьте диск, права и pipe.
- `curl (28)`: timeout; проверьте сеть/VPN и доступность источника.
- `tar: Error opening archive`: файл не скачан, путь испорчен или архив повреждён.

Не повторяйте расходуемую установочную попытку, пока не определена категория ошибки.

## Курс-токен отклонён

Это отдельный контур, не Hermes. Не чините Python, gateway или Telegram.

Проверьте:

- команда получена заново и вставлена целиком;
- токен не истёк и ещё не использован;
- дата и время компьютера корректны;
- endpoint `school.serditov.ru` доступен.

Если два свежих токена отклонены одинаково, остановите повторы и передайте служебный
идентификатор ошибки владельцу token gate. Сам секрет токена не публикуйте.
