# Infobiz Agents terminal installer

Preferred student install path for macOS.

The installer uses the official Hermes repository as the source of truth, but
does not call the official interactive installer:

- Hermes source: `https://github.com/NousResearch/hermes-agent`
- Hermes source is downloaded as a GitHub tarball, not via `git clone`
- `uv`, Python 3.11, Node.js, venv, and Hermes dependencies are installed
  silently from the terminal installer
- The local web panel is installed into `~/InfobizAgents/web-shell` and started
  as a user LaunchAgent
- An `Infobiz Agents.app` launcher is created in `/Applications` when possible,
  otherwise in `~/Applications`
- Telegram Bot Token is configured in the web panel after install, not in the
  terminal installer
- The Documents tab is built into the web panel and uses local `docs.json`;
  it does not require a separate docs server on port 3030
- Agents can use the bundled `webshell-docs` skill to create, search, update,
  and delete pages in the built-in Documents database through the WebShell API
- VPS installers can provide `WEB_SHELL_PUBLIC_URL` when the panel is exposed
  through a tunnel or public HTTPS endpoint
- Student-facing output: quiet Infobiz steps only
- Full technical output: `~/InfobizAgents/install.log`

This avoids macOS Command Line Tools prompts on clean Macs.

The profile release payload contains only custom skill directories under
`profile/skills/`. The installer creates a clean Hermes profile from the
official repository first, seeds standard Hermes bundled skills when available,
and then overlays our custom skills. The shared `webshell-docs` skill is also
copied into the default Hermes profile so both `Гермес` and `Маркетолог` can
work with built-in documents. The payload does not ship auth, tokens, local
config, SOUL.md, logs, sessions, memories, state databases, or runtime files
from a developer machine.

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

## Build web shell payload

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

## Hosted install command

Upload:

- `install-infobiz-agents.sh`
- `infobiz-agent-profile-marketer-0.1.0.tar.gz`
- `agent-web-shell-0.1.0.tar.gz`

Then publish:

```bash
BASE_URL="https://github.com/USER/REPO/releases/download/v0.1.0" \
  /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install-infobiz-agents.sh)"
```

## VPS install

Recommended VPS:

- Ubuntu 24.04 LTS or Ubuntu 22.04 LTS
- x86_64 / amd64
- 4 vCPU, 8 GB RAM, 80 GB SSD/NVMe
- public IPv4

Remote install from a local terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-remote.sh | bash -s -- root@SERVER_IP
```

Remote install with password in one command:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-remote.sh | bash -s -- root@SERVER_IP 'VPS_PASSWORD'
```

Direct install on the VPS:

```bash
VERSION="0.1.0" \
BASE_URL="https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0" \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-vps-infobiz-agents.sh)"
```

The VPS installer creates these agents:

- `Гермес` (`default`)
- `Дизайнер` (`designer`)
- `Копирайтер` (`copywriter`)
- `Маркетолог` (`marketer`)
- `Продюсер` (`producer`)
- `Технарь` (`tech`)

WebShell is exposed as `http://SERVER_IP:8787/?token=...` and protected by a
generated token. Agents use the internal local API
`http://127.0.0.1:8787`.

The default VPS installer UI is quiet: it shows a simple progress bar, pauses
only for OpenAI device-code authorization, and prints the WebShell URL at the
end. Set `STUDENT_UI=0` for verbose technical output.

Remote uninstall from a local terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/uninstall-vps-remote.sh | bash -s -- root@SERVER_IP 'VPS_PASSWORD'
```
