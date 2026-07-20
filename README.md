# Infobiz Agents terminal installer

Internal installer payload repository.

Student-facing installs should go through the token gate on `school.serditov.ru`.
Do not send raw GitHub or GitHub Releases commands to students.

Student/Codex support documentation is bundled into WebShell and installed at:

```text
~/InfobizAgents/web-shell/public/support-docs/START_HERE.md
```

The WebShell control panel has one `Скачать пакет для Codex` button. It creates
a ZIP with the runbook, `AGENTS.md`, a ready prompt, connection hints, and
redacted live diagnostics. Secrets are excluded. The diagnostics-free fallback
for the school site is built at:

```text
dist/infobiz-agents-codex-support.zip
```

Windows student command:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/install.ps1')"
```

Update:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/update.ps1')"
```

Uninstall:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://school.serditov.ru/uninstall.ps1')"
```

The `school.serditov.ru` app verifies a one-time token and proxies private
GitHub assets to the VPS through short-lived install sessions. The GitHub token
must live only on the `school.serditov.ru` server.

## Internal details

The installer uses the official Hermes repository and delegates the base Hermes
runtime setup to Hermes' own `setup-hermes.sh` in non-interactive mode:

- Hermes source: `https://github.com/NousResearch/hermes-agent`
- a clean install resolves the latest official stable GitHub release and
  downloads its tarball, not a stale bundled Hermes copy or `git clone`
- the Mac and VPS update scripts also refresh Hermes to the latest official
  stable release before applying the Infobiz profiles and compatibility layer
- `uv`, Python 3.11, venv, Hermes dependencies, `.env`, command shim, and
  bundled Hermes skills are installed by the official Hermes setup script
- official Hermes dependencies are left intact; the Infobiz installer no
  longer downgrades `aiohttp` or replaces Hermes extras after setup
- Node.js is still installed by the Infobiz installer because it is required by
  the bundled WebShell
- The local web panel is installed into `~/InfobizAgents/web-shell` and started
  as a user LaunchAgent
- A `HERMES.app` launcher with the bundled portrait icon is created in `/Applications` when possible,
  otherwise in `~/Applications`
- Telegram Bot Token is configured in the web panel after install, not in the
  terminal installer
- Telegram access is closed until at least one allowed Telegram ID is added
- the model picker reads the catalog from installed Hermes, adds forward-
  compatible GPT-5.6 choices, checks account access before saving, and passes
  the selected model into the real Codex app-server session
- The Documents tab is built into the web panel and uses local `docs.json`;
  it does not require a separate docs server on port 3030
- Agents can use the bundled `webshell-docs` skill to create, search, update,
  and delete pages in the built-in Documents database through the WebShell API
- WebShell chat runs in a restricted control-panel mode: browser, terminal,
  code-execution, and direct file toolsets are blocked there. Telegram gateways
  keep the normal Hermes tool surface.
- VPS installers can provide `WEB_SHELL_PUBLIC_URL` when the panel is exposed
  through a tunnel or public HTTPS endpoint
- Student-facing output: quiet Infobiz steps only
- Full technical output: `~/InfobizAgents/install.log`

This avoids macOS Command Line Tools prompts on clean Macs.

The profile release payload is built from the current agent product workspace:
`~/.hermes-workspaces/marketer/agent-product`. The installer creates clean
Hermes profiles from the official repository first, seeds standard Hermes
bundled skills when available, and then overlays our curated agent folders.
The shared `webshell-docs` skill is also copied into the default Hermes profile
so `Гермес` and the role agents can work with built-in documents. The payload
does not ship auth, tokens, local config, logs, sessions, memories, state
databases, or runtime files from a developer machine.

The web panel payload contains portable source only. It excludes local run
history, approval history, snapshots, preflights, uploads, and personal
baselines.

## Build profile payload

```bash
./scripts/build-profile-payload.sh
```

The archive is written to:

```text
dist/infobiz-agent-profile-marketer-0.1.0.tar.gz
```

Before uploading the payload to GitHub Releases, run the smoke test:

```bash
./scripts/smoke-test-profile-payload.sh
```

It extracts the payload into a temporary directory, verifies that only the
expected profiles are shipped, and runs the same Hermes context-file scanner
that can block `SOUL.md` at runtime. Optional live identity check:

```bash
LIVE_SMOKE=1 PROFILE=marketer EXPECT="Маркетолог" \
  ./scripts/smoke-test-profile-payload.sh
```

When Hermes publishes a new release, also run the upstream compatibility test:

```bash
./scripts/smoke-test-hermes-upstream.sh
```

It checks both the latest stable Hermes release and current official `main`,
applies every Infobiz source patch twice, compiles the changed modules, and
verifies that a WebShell model choice such as `gpt-5.6-sol` reaches the Codex
app-server thread instead of being only a visual setting.

## Build web shell payload

Build the release archive with:

```bash
./scripts/build-web-shell-payload.sh
```

The release archive is:

```text
dist/agent-web-shell-0.1.0.tar.gz
```

It must contain a top-level `web-shell/` directory.

## Local test

```bash
PROFILE_TARBALL="/path/to/infobiz-agent-profile-marketer-0.1.0.tar.gz" \
  ./install-infobiz-agents.sh
```

## Legacy direct GitHub install

These commands are for internal debugging while this repo is still public. They
will stop working for normal users after the repository is made private unless
the caller has GitHub credentials. Use `school.serditov.ru` for students.

Upload:

- `install-infobiz-agents.sh`
- `infobiz-agent-profile-marketer-0.1.0.tar.gz`
- `agent-web-shell-0.1.0.tar.gz`

Direct macOS debug command:

```bash
BASE_URL="https://github.com/USER/REPO/releases/download/v0.1.0" \
  /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install-infobiz-agents.sh)"
```

Direct macOS debug update for an already installed local Mac:

```bash
BASE_URL="https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0" \
  /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-infobiz-agents.sh)"
```

## VPS install internals

Recommended VPS:

- Ubuntu 24.04 LTS or Ubuntu 22.04 LTS
- x86_64 / amd64
- 4 vCPU, 8 GB RAM, 80 GB SSD/NVMe
- public IPv4

Legacy remote install from a local terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-remote.sh | bash -s -- root@SERVER_IP
```

Legacy password-in-command mode exists for old internal tests, but it exposes
the password to shell history. Do not give this form to students; use the
interactive command above or the Windows launcher, both of which prompt for
the password without echoing it.

Legacy internal-only form:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-remote.sh | bash -s -- root@SERVER_IP 'VPS_PASSWORD'
```

Legacy direct install on the VPS:

```bash
VERSION="0.1.0" \
BASE_URL="https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0" \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh)"
```

The VPS installer creates these agents:

- `Гермес` (`default`)
- `Маркетолог` (`marketer`)
- `Копирайтер` (`copywriter`)
- `Дизайнер` (`designer`)
- `Технарь` (`tech`)

WebShell is exposed as `http://SERVER_IP:8787/?token=...` and protected by a
generated token. Agents use the internal local API
`http://127.0.0.1:8787`.

The default VPS installer UI is quiet: it shows a simple progress bar, pauses
only for OpenAI device-code authorization, and prints the WebShell URL at the
end. Set `STUDENT_UI=0` for verbose technical output.

Legacy remote uninstall from a local terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/uninstall-vps-remote.sh | bash -s -- root@SERVER_IP 'VPS_PASSWORD'
```

Legacy Windows PowerShell installer:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/start-windows-installer.ps1')"
```

Legacy Windows PowerShell update for an already installed VPS:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm 'https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/update-agents-windows.ps1')"
```
