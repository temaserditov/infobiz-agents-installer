# Карта системы

## Слои продукта

1. **Официальный Hermes** — runtime, Python venv, CLI, gateway и стандартные зависимости.
2. **Infobiz Agents** — профили, WebShell, launchd/systemd units и совместимые патчи.
3. **Пользовательские данные** — OAuth, Telegram-токены и ID, память, сессии,
   документы и локальные настройки.

Ремонт одного слоя не должен без необходимости переписывать другой.

## Стандартные пути

| Назначение | Путь |
|---|---|
| Корень продукта | `~/InfobizAgents` |
| Исходники WebShell | `~/InfobizAgents/web-shell` |
| Ссылка на WebShell | `~/InfobizAgents/webshell-url.txt`, `~/InfobizAgents/web-shell.url` |
| Лог установки | `~/InfobizAgents/install.log` |
| Лог обновления | `~/InfobizAgents/update.log` |
| Логи WebShell | `~/InfobizAgents/web-shell.out.log`, `web-shell.err.log` |
| Корень Hermes | `~/.hermes` |
| Официальный runtime | `~/.hermes/hermes-agent` |
| Python Hermes | `~/.hermes/hermes-agent/venv/bin/python` |
| CLI | `~/.local/bin/hermes` |
| Главный профиль | `~/.hermes` |
| Ролевой профиль | `~/.hermes/profiles/<profile>` |
| Лог gateway профиля | `<profile>/logs/gateway.log` |
| Рабочие пространства | `~/.hermes-workspaces` |
| Документы/Obsidian | `~/InfobizAgents/obsidian-vault` |

Профили продукта:

| ID | Имя |
|---|---|
| `default` | Гермес |
| `marketer` | Маркетолог |
| `copywriter` | Копирайтер |
| `designer` | Дизайнер |
| `tech` | Технарь |

## macOS: launchd

Сервисы:

```text
com.infobiz.agents.web-shell
ai.hermes.gateway
ai.hermes.gateway-marketer
ai.hermes.gateway-copywriter
ai.hermes.gateway-designer
ai.hermes.gateway-tech
```

Проверка:

```bash
uid="$(id -u)"
launchctl print "gui/$uid/com.infobiz.agents.web-shell"
launchctl print "gui/$uid/ai.hermes.gateway"
launchctl print "gui/$uid/ai.hermes.gateway-marketer"
launchctl print "gui/$uid/ai.hermes.gateway-copywriter"
launchctl print "gui/$uid/ai.hermes.gateway-designer"
launchctl print "gui/$uid/ai.hermes.gateway-tech"
```

Перезапуск одного gateway:

```bash
launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway-designer"
```

Перезапуск панели:

```bash
launchctl kickstart -k "gui/$(id -u)/com.infobiz.agents.web-shell"
```

## VPS: systemd

Сервисы:

```text
infobiz-web-shell.service
infobiz-hermes-gateway.service
infobiz-hermes-gateway-marketer.service
infobiz-hermes-gateway-copywriter.service
infobiz-hermes-gateway-designer.service
infobiz-hermes-gateway-tech.service
```

Проверка:

```bash
systemctl --no-pager --full status infobiz-web-shell.service
systemctl --no-pager --full status 'infobiz-hermes-gateway*.service'
systemctl --failed --no-pager
```

Логи и перезапуск одного профиля:

```bash
journalctl -u infobiz-hermes-gateway-designer.service -n 150 --no-pager
systemctl restart infobiz-hermes-gateway-designer.service
systemctl is-active infobiz-hermes-gateway-designer.service
```

## Официальные средства Hermes

Используйте установленный CLI, а не системный Python:

```bash
HERMES="$HOME/.local/bin/hermes"
test -x "$HERMES" || HERMES="$HOME/.hermes/hermes-agent/venv/bin/hermes"
"$HERMES" doctor
"$HERMES" dump
"$HERMES" logs gateway -n 100
"$HERMES" auth status openai-codex
```

Для отдельного профиля задайте его `HERMES_HOME`:

```bash
HERMES_HOME="$HOME/.hermes/profiles/designer" "$HERMES" doctor
HERMES_HOME="$HOME/.hermes/profiles/designer" "$HERMES" logs gateway -n 100
```

## WebShell

На Mac откройте приложение `HERMES.app` либо адрес из:

```bash
cat "$HOME/InfobizAgents/webshell-url.txt" 2>/dev/null || cat "$HOME/InfobizAgents/web-shell.url"
```

На VPS используйте публичную ссылку с токеном, которую выдал установщик. Сам
WebShell обращается к агентам через локальный API на сервере. Не публикуйте ссылку:
параметр `token` даёт доступ к панели.

WebShell умеет собирать редактированный support bundle со статусом сервисов,
процессов и последними строками логов. Это предпочтительнее скриншотов.
