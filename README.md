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
- VPS installers can provide `WEB_SHELL_PUBLIC_URL` when the panel is exposed
  through a tunnel or public HTTPS endpoint
- Student-facing output: quiet Infobiz steps only
- Full technical output: `~/InfobizAgents/install.log`

This avoids macOS Command Line Tools prompts on clean Macs.

The profile release payload contains only custom skill directories under
`profile/skills/`. The installer creates a clean Hermes profile from the
official repository first, seeds standard Hermes bundled skills when available,
and then overlays our custom skills. It does not ship auth, tokens, local config,
SOUL.md, logs, sessions, memories, state databases, or runtime files from a
developer machine.

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
