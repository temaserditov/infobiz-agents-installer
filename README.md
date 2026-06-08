# Infobiz Agents terminal installer

Preferred student install path for macOS.

The installer uses the official Hermes repository and installer:

- Hermes source: `https://github.com/NousResearch/hermes-agent`
- Runtime/dependencies: installed by Hermes `scripts/install.sh --skip-setup`
- Student-facing output: quiet Infobiz steps only
- Full technical output: `~/InfobizAgents/install.log`

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
