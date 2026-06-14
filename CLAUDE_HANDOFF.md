# Claude Code Handoff: Infobiz Agents Installer

## Context

This repository is `temaserditov/infobiz-agents-installer`.

The goal is a low-friction installer for non-technical students. Students should not configure Hermes, Node, Python, agents, or WebShell manually.

Primary target right now:

- Windows student machine
- Ubuntu/Debian VPS
- Student runs one PowerShell command
- Command asks for VPS IP and SSH password
- Installer updates or installs Hermes agents and WebShell on the VPS
- Student uses WebShell URL from browser

The user is Russian-speaking and wants a brutally simple UX. Avoid asking students technical questions unless absolutely unavoidable.

## Current Repo Location

Local working copy used in Codex:

```text
/tmp/infobiz-agents-installer-publish
```

GitHub:

```text
https://github.com/temaserditov/infobiz-agents-installer
```

Current branch:

```text
main
```

Latest important commit at handoff:

```text
d6ee909 Add per-agent Telegram token settings
```

## Install Commands

### Windows fresh install

Give students this command in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/start-windows-installer.ps1?cb=20260612-1835')"
```

Behavior:

- If launched from Windows PowerShell x86, `start-windows-installer.ps1` opens 64-bit PowerShell.
- It then loads `install-agents-windows.ps1`.
- Student enters only VPS IP, for example:

```text
109.207.169.142
```

- Script internally uses `root@IP`.
- It uses system OpenSSH, preferring:

```text
C:\Windows\System32\OpenSSH\ssh.exe
```

### Windows update existing VPS install

Use this for already installed VPS when only WebShell/updater code changed:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-agents-windows.ps1?cb=20260612-1900')"
```

Behavior:

- Asks only VPS IP.
- Internally uses `root@IP`.
- SSHes into VPS.
- Runs `update-vps-infobiz-agents.sh`.
- Updates WebShell files from release archive without reinstalling Hermes/agents.

### VPS fresh install from inside server

If already SSHed into VPS:

```bash
STUDENT_UI=1 VERSION='0.1.0' BASE_URL='https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0' bash -lc 'tmp=/tmp/install-vps-infobiz-agents.sh; curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh -o $tmp; chmod +x $tmp; $tmp'
```

### VPS uninstall from Mac/Linux

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/uninstall-vps-remote.sh | bash -s -- root@SERVER_IP 'VPS_PASSWORD'
```

## Release Assets

The VPS installer downloads release assets from:

```text
https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0
```

Important assets:

```text
agent-web-shell-0.1.0.tar.gz
infobiz-agent-profile-marketer-0.1.0.tar.gz
```

When WebShell code changes, rebuild and upload:

```bash
rm -f dist/agent-web-shell-0.1.0.tar.gz
COPYFILE_DISABLE=1 tar \
  --exclude='.DS_Store' \
  --exclude='node_modules' \
  --exclude='preflights/*.json' \
  --exclude='runs/*.json' \
  --exclude='snapshots/*.json' \
  -czf dist/agent-web-shell-0.1.0.tar.gz web-shell
gh release upload v0.1.0 dist/agent-web-shell-0.1.0.tar.gz --clobber
```

If profile skills payload changes, rebuild profile tarball with:

```bash
scripts/build-profile-payload.sh
gh release upload v0.1.0 dist/infobiz-agent-profile-marketer-0.1.0.tar.gz --clobber
```

## Agents Installed

VPS installer installs five profiles:

```text
default   -> Гермес
designer  -> Дизайнер
copywriter -> Копирайтер
marketer  -> Маркетолог
tech      -> Технарь
```

All profiles get the custom skills payload. Default Hermes also exists as the main agent.

Default model settings currently written into each `.env`:

```bash
HERMES_INFERENCE_PROVIDER='openai-codex'
HERMES_INFERENCE_MODEL='gpt-5.5'
```

## WebShell Notes

Main files:

```text
web-shell/server.mjs
web-shell/public/index.html
web-shell/public/app.js
web-shell/public/app.css
web-shell/runner.py
```

Recent changes:

- Legacy/OpenClaw/browser preflight checks are diagnostic, not blocking.
- Telegram settings now have one token field per agent.
- Empty Telegram fields do not erase existing tokens.
- Saving Telegram tokens on Linux/VPS restarts systemd gateway services.

Telegram API:

```text
GET  /api/telegram
POST /api/telegram
```

POST body:

```json
{
  "tokens": {
    "default": "123:ABC...",
    "designer": "123:ABC...",
    "copywriter": "123:ABC...",
    "marketer": "123:ABC...",
    "tech": "123:ABC..."
  }
}
```

Old per-agent endpoints remain:

```text
GET  /api/agents/:id/telegram
POST /api/agents/:id/telegram
```

## VPS Services

WebShell:

```text
infobiz-web-shell.service
```

Gateways:

```text
infobiz-hermes-gateway.service
infobiz-hermes-gateway-designer.service
infobiz-hermes-gateway-copywriter.service
infobiz-hermes-gateway-marketer.service
infobiz-hermes-gateway-tech.service
```

WebShell service environment includes:

```text
WEB_SHELL_ACCESS_TOKEN
PORT=8787
HOST=0.0.0.0
AGENT_PROFILE_ALLOW=default,designer,copywriter,marketer,tech
```

## Windows Gotchas Already Hit

Do not regress these:

1. Many users open `Windows PowerShell (x86)`.
2. x86 PowerShell may resolve `System32` strangely.
3. A student successfully logged in manually with:

```powershell
C:\Windows\System32\OpenSSH\ssh.exe root@109.207.169.142
```

4. Avoid "smart" SSH options that change auth behavior. Earlier options like disabling pubkey auth broke working SSH.
5. `start-windows-installer.ps1` exists to jump into 64-bit PowerShell before running the main installer.
6. In PowerShell, `$Host` is a reserved read-only variable. Do not use `$host` as a local variable because PowerShell variables are case-insensitive.
7. In PowerShell string interpolation, use `${Var}` or concatenation before `?cb=...`; otherwise `$Var?cb` can become broken.

## Tests / Checks

Run from repo root:

```bash
bash -n install-vps-infobiz-agents.sh
bash -n update-vps-infobiz-agents.sh
pwsh -NoProfile -Command '$files=@("./install-agents-windows.ps1","./start-windows-installer.ps1","./update-agents-windows.ps1"); foreach ($f in $files) { $errors=$null; $tokens=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$tokens, [ref]$errors) > $null; if ($errors.Count) { Write-Host "ERROR $f"; $errors | Format-List *; exit 1 } else { Write-Host "OK $f" } }'
cd web-shell && npm run check
```

When WebShell changes, do not forget to:

1. Run checks.
2. Rebuild `dist/agent-web-shell-0.1.0.tar.gz`.
3. Upload with `gh release upload ... --clobber`.
4. Commit source changes.
5. Push `main`.

## Current Desired Next Work

The user asked to continue improving:

- Windows update/install flow UX.
- WebShell settings UX, especially Telegram tokens.
- Existing install update path, not full reinstall.

A likely next verification step:

1. Run Windows update command against the test VPS.
2. Open WebShell.
3. Go to Settings -> Telegram.
4. Confirm there is one field per agent.
5. Save one token.
6. Confirm corresponding `.env` on VPS changed:

```bash
grep TELEGRAM_BOT_TOKEN ~/.hermes/profiles/marketer/.env
```

7. Confirm gateway restarted:

```bash
systemctl status infobiz-hermes-gateway-marketer.service
```

## User Preference

For student-facing commands:

- Do not ask for login if we can assume `root`.
- Ask only for VPS IP.
- Hide technical noise when possible.
- Do not expose DMG/local panel legacy demo stuff.
- If a link/command did not change, explicitly say "Ссылка та же".
- If a link/command changed, provide the new one.
