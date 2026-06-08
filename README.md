# Infobiz Agents terminal installer

Preferred student install path for macOS.

The installer uses the official Hermes repository as the source of truth, but
does not call the official interactive installer:

- Hermes source: `https://github.com/NousResearch/hermes-agent`
- Hermes source is downloaded as a GitHub tarball, not via `git clone`
- `uv`, Python 3.11, Node.js, venv, and Hermes dependencies are installed
  silently from the terminal installer
- Student-facing output: quiet Infobiz steps only
- Full technical output: `~/InfobizAgents/install.log`

This avoids macOS Command Line Tools prompts on clean Macs.

Our release payload contains only the `marketer` profile. It excludes auth,
tokens, logs, sessions, state databases, and runtime files.

## Build profile payload

```bash
./terminal-installer/build-profile-payload.sh
```

The archive is written to:

```text
terminal-installer/dist/infobiz-agent-profile-marketer-0.1.0.tar.gz
```

## Local test

```bash
PROFILE_TARBALL="/path/to/infobiz-agent-profile-marketer-0.1.0.tar.gz" \
  ./terminal-installer/install-infobiz-agents.sh
```

## Hosted install command

Upload:

- `install-infobiz-agents.sh`
- `infobiz-agent-profile-marketer-0.1.0.tar.gz`

Then publish:

```bash
BASE_URL="https://github.com/USER/REPO/releases/download/v0.1.0" \
  /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install-infobiz-agents.sh)"
```
