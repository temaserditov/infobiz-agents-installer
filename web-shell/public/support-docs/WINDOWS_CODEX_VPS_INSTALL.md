# Windows + Codex: установка на VPS

Этот путь нужен для учеников Windows. Windows не устанавливает агентов локально:
Codex использует Windows только чтобы открыть SSH-соединение, а установка идёт
на VPS в Linux shell.

Если на Windows нет SSH-клиента, Codex должен сам включить Windows OpenSSH
Client. Ученик не вставляет пароль VPS в чат: пароль вводится только в защищённый
terminal prompt, когда его попросит `ssh`.

## Готовый промт для Codex

```text
Установи Infobiz Agents / Hermes на мой VPS через SSH.

VPS: root@SERVER_IP

Правила:
- не проси и не принимай пароль в чат;
- сначала проверь, есть ли на Windows SSH-клиент: выполни `where.exe ssh` и `ssh -V`;
- если `ssh` не найден, не останавливайся на объяснении: установи Windows OpenSSH Client;
- для установки OpenSSH Client используй admin/UAC-команду:
  `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command "Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"'`;
- если Windows покажет UAC/админ-подтверждение, скажи мне подтвердить его и продолжай после установки;
- после установки снова проверь `where.exe ssh` и `ssh -V`;
- если SSH попросит пароль от VPS, дай мне ввести его только в защищенный terminal prompt;
- не используй Windows PowerShell-установку агентов;
- Windows нужен только для запуска Codex и SSH, установка должна идти на VPS;
- если появится OpenAI device authorization, покажи мне URL и code в чате;
- после моей авторизации проверь systemd gateway-сервисы и WebShell;
- в конце прочитай `~/InfobizAgents/webshell-url.txt` или `~/InfobizAgents/web-shell.url` на VPS и верни кликабельную ссылку WebShell.

Команда установки на VPS:
<ВСТАВЬТЕ СЮДА АКТУАЛЬНУЮ КОМАНДУ УСТАНОВКИ ИЗ УРОКА>
```

## Что может потребоваться от ученика

- подтвердить UAC/админ-окно Windows для установки OpenSSH Client;
- разрешить сетевой доступ Codex/терминалу, если спросит firewall или антивирус;
- ввести пароль VPS в SSH prompt;
- пройти OpenAI device authorization в браузере.

VNC/serial console остаётся аварийным доступом. Длинную ссылку WebShell из VNC
копировать не нужно: Codex должен прочитать её с VPS из
`~/InfobizAgents/webshell-url.txt`.
