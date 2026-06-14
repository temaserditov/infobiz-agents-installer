# Claude Code Task: Polish WebShell Settings and Payload Hygiene

## Context

Repo:

```text
/Users/serditov/Documents/New project/infobiz-agents-installer
```

This repo contains the VPS installer payload and the WebShell source.
Student-facing install/update/uninstall commands should go through `school.serditov.ru`, not raw GitHub URLs.

Do not rewrite the installer from scratch. Work with the existing files.

Current WebShell files:

```text
web-shell/server.mjs
web-shell/public/index.html
web-shell/public/app.js
web-shell/public/app.css
web-shell/runner.py
web-shell/package.json
```

Current VPS installer files:

```text
install-vps-infobiz-agents.sh
update-vps-infobiz-agents.sh
uninstall-vps-infobiz-agents.sh
```

## Student Commands Must Stay Stable

Do not change these links unless Artem explicitly asks:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/install.ps1')"
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/update.ps1')"
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/uninstall.ps1')"
```

If commands are unchanged, report in Russian:

```text
Ссылки те же.
```

## Current State

Per-agent Telegram settings already exist.

Known existing implementation:

- `GET /api/telegram`
- `POST /api/telegram`
- old compatibility endpoints:
  - `GET /api/agents/:id/telegram`
  - `POST /api/agents/:id/telegram`
- UI section in `web-shell/public/index.html`
- rendering/saving logic in `web-shell/public/app.js`
- token persistence in `web-shell/server.mjs`

The UI already creates one token input per profile and does not overwrite old tokens when fields are empty.

## Goal

Polish and verify the WebShell settings experience before it is shipped to students.

The user wants:

- no Telegram token prompt in terminal installer;
- Telegram tokens configured inside WebShell;
- one token field per agent;
- tokens visible when the user chooses to show them;
- no bot avatars pulled from Artem's personal bots;
- no old demo labels;
- no "Агенты сердитого";
- no "Локальная панель без телеграм";
- brand should simply be `Агенты`;
- bundled Documents tab should work, not hang forever on "Загружаю документы";
- bundled WebShell docs skill should let agents create/search/update/delete pages in the local WebShell documents database.

## Required Checks and Fixes

### 1. Telegram Settings UX

Review:

```text
web-shell/public/index.html
web-shell/public/app.js
web-shell/public/app.css
web-shell/server.mjs
```

Confirm or fix:

- Settings panel has one Telegram token input for every installed profile:
  - `default` / Гермес
  - `designer` / Дизайнер
  - `copywriter` / Копирайтер
  - `marketer` / Маркетолог
  - `tech` / Технарь
- Empty token fields do not erase existing tokens.
- Invalid token shows a clear UI error.
- Saving tokens restarts the matching gateway services on VPS.
- The "Показать токены" button actually toggles input type between `password` and `text`.
- When visible, pasted tokens are readable, not black dots.
- After successful save, inputs clear or remain in a sane state; do not accidentally expose saved tokens forever.

### 2. Remove Old Branding and Avatars

Search and remove/avoid:

```text
Агенты сердитого
Локальная панель без телеграм
сердитого
без телеграм
```

Brand should be:

```text
Агенты
```

Do not fetch Telegram bot avatars.

If default avatar URLs are generated from local assets in `web-shell/server.mjs`, ensure missing assets do not cause broken-looking UI.
Simple initials/placeholders are fine.

### 3. Documents Tab

The WebShell includes a Notion-like local documents database.

Review:

```text
web-shell/docs.json
skills/webshell-docs/SKILL.md
skills/webshell-docs/scripts/webshell_docs.py
web-shell/server.mjs
web-shell/public/app.js
web-shell/public/index.html
```

Confirm or fix:

- Opening Documents does not hang forever on "Загружаю документы".
- Empty docs state renders normally.
- API errors are visible in UI.
- `webshell-docs` skill points to the local WebShell document API/database, not real Notion.
- Agents can list, search, get, create, update, and delete pages.
- The skill is copied into all installed profiles where intended, including default Hermes.

### 4. Payload Hygiene

When packaging WebShell, the archive must not include runtime junk:

- `node_modules`
- `.DS_Store`
- uploads from developer machine
- run history
- approvals
- snapshots
- preflight outputs
- personal baselines
- auth tokens
- `.env`

Review current packaging instructions and scripts.
If there is no script for WebShell tarball hygiene, add one or update docs/checks.

### 5. Installer Prompt Hygiene

Review:

```text
install-vps-infobiz-agents.sh
update-vps-infobiz-agents.sh
install-infobiz-agents.sh
```

Confirm:

- terminal install does not prompt for Telegram bot token;
- student sees WebShell URL at the end;
- WebShell URL includes access token;
- VPS install exposes WebShell on `0.0.0.0:8787` unless a public URL override is used;
- if `WEB_SHELL_PUBLIC_URL` is set, installer prints that stable public URL.

## Checks

Run from repo root:

```bash
bash -n install-vps-infobiz-agents.sh
bash -n update-vps-infobiz-agents.sh
bash -n uninstall-vps-infobiz-agents.sh
bash -n install-infobiz-agents.sh
bash -n update-vps-infobiz-agents.sh
cd web-shell && npm run check
```

If PowerShell is installed locally, also run:

```powershell
pwsh -NoProfile -Command '$files=@("./install-agents-windows.ps1","./start-windows-installer.ps1","./update-agents-windows.ps1"); foreach ($f in $files) { $errors=$null; $tokens=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$tokens, [ref]$errors) > $null; if ($errors.Count) { Write-Host "ERROR $f"; $errors | Format-List *; exit 1 } else { Write-Host "OK $f" } }'
```

Search checks:

```bash
rg -n "Агенты сердитого|Локальная панель без телеграм|сердитого|без телеграм"
rg -n "TELEGRAM_BOT_TOKEN|/api/telegram|telegram-token"
rg -n "Загружаю документы|docs.json|webshell-docs"
```

## Packaging After Source Changes

If WebShell source changes:

```bash
rm -f dist/agent-web-shell-0.1.0.tar.gz
COPYFILE_DISABLE=1 tar \
  --exclude='.DS_Store' \
  --exclude='node_modules' \
  --exclude='preflights/*.json' \
  --exclude='runs/*.json' \
  --exclude='snapshots/*.json' \
  --exclude='uploads/*' \
  --exclude='.env' \
  -czf dist/agent-web-shell-0.1.0.tar.gz web-shell
```

Inspect archive before upload:

```bash
tar -tzf dist/agent-web-shell-0.1.0.tar.gz | rg "node_modules|\\.DS_Store|preflights/|runs/|snapshots/|uploads/|\\.env" && exit 1 || true
```

Only upload after checks pass:

```bash
gh release upload v0.1.0 dist/agent-web-shell-0.1.0.tar.gz --clobber
```

## Commit

Commit only relevant files. Suggested message:

```text
Polish WebShell settings and payload hygiene
```

Do not commit unrelated local files.
