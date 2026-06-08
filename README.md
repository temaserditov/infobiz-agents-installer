# Infobiz Agents Installer

Install the marketer Hermes agent on macOS:

```bash
BASE_URL="https://github.com/temaserditov/infobiz-agents-installer/releases/download/v0.1.0" /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/install-infobiz-agents.sh)"
```

The installer bundles Hermes, Python, and Node.js inside the release payload.
It does not ask students whether to install missing dependencies.

Uninstall all test installer artifacts:

```bash
/bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/temaserditov/infobiz-agents-installer/main/uninstall-infobiz-agents.sh)"
```

Current payloads:

- `infobiz-agents-marketer-macos-arm64-0.1.0.tar.gz`

Intel Mac support requires a separate `x86_64` payload.
