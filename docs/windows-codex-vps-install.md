# Windows Codex VPS install

Recommended student flow:

1. Install Codex on Windows and sign in.
2. Open a new Codex task.
3. Paste the ready prompt below.
4. Type the VPS password only into the secure terminal prompt when SSH asks for it.
5. Complete OpenAI device authorization in the browser.
6. Open the WebShell URL that Codex returns in chat.

Codex should run the installer on the VPS through SSH. The Windows PowerShell
bitness is not part of the install path because the actual installation runs in
the Linux shell on the VPS.

## Requirements that can still appear

- Windows OpenSSH Client must be available. Codex can check it with `ssh -V`.
- If OpenSSH Client is missing, Windows may require an admin prompt to enable or
  install it.
- Windows Firewall, antivirus, or the Codex app may ask for network permission.
- The VPS must allow SSH login for the provided user, usually `root@SERVER_IP`.
- The VPS should be Ubuntu/Debian x86_64 with enough CPU/RAM/disk for the course.

VNC or the provider serial console is only emergency access. The student should
not copy the long WebShell URL from VNC. After installation, Codex reads the URL
from:

```text
~/InfobizAgents/webshell-url.txt
```

The legacy-compatible file also remains:

```text
~/InfobizAgents/web-shell.url
```

## Ready prompt for the student

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

For internal direct VPS debugging, the current raw command has not changed:

```bash
VERSION="0.1.0" \
BASE_URL="https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0" \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh)"
```
