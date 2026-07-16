#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def load_yaml_module() -> Any:
    try:
        import yaml  # type: ignore
    except Exception as exc:  # pragma: no cover - installer environment guard
        fail(f"PyYAML is required for Hermes runtime safety patch: {exc}")
    return yaml


def profile_paths(hermes_root: Path, profiles: list[str]) -> list[Path]:
    paths = [hermes_root]
    for profile in profiles:
        profile = profile.strip()
        if profile and profile != "default":
            paths.append(hermes_root / "profiles" / profile)
    return paths


def ensure_dict(parent: dict[str, Any], key: str) -> dict[str, Any]:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def atomic_write_text(path: Path, text: str, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.infobiz.tmp")
    tmp.write_text(text, encoding="utf-8")
    if mode is not None:
        tmp.chmod(mode)
    tmp.replace(path)


def patch_config(path: Path, yaml: Any) -> bool:
    raw = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        data = {}

    before = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)

    model = ensure_dict(data, "model")
    configured_provider = str(model.get("provider") or "").strip()
    if configured_provider and configured_provider != "openai-codex":
        # This patch only owns the Codex OAuth runtime. Never rewrite a user
        # profile that was deliberately switched to another provider.
        return False
    model["provider"] = "openai-codex"
    # Keep the official Hermes transport. codex_app_server is an optional
    # runtime that requires a separately installed `codex` executable; forcing
    # it made clean student machines fail after an otherwise valid OAuth login.
    model["openai_runtime"] = "auto"
    model.pop("api_mode", None)
    model.setdefault("default", "gpt-5.4-mini")
    model["base_url"] = ""
    # Let current Hermes/Codex metadata provide the real context window. A
    # stale hard-coded 100k cap made newer GPT-5.x models look much smaller.
    model.pop("context_length", None)

    # Student-facing messaging should deliver one finished answer. Hermes has
    # two independent partial-output mechanisms, so disable both progressive
    # token edits and natural mid-turn assistant messages.
    streaming = ensure_dict(data, "streaming")
    streaming["enabled"] = False
    streaming["transport"] = "off"

    display = ensure_dict(data, "display")
    display["streaming"] = False
    display["interim_assistant_messages"] = False
    platforms = ensure_dict(display, "platforms")
    telegram = ensure_dict(platforms, "telegram")
    telegram["streaming"] = False

    auxiliary = ensure_dict(data, "auxiliary")
    title_generation = ensure_dict(auxiliary, "title_generation")
    title_generation["enabled"] = False

    # Migrate values written by older Infobiz installers. They disabled native
    # Hermes memory/compression nudges globally; leaving the keys in an existing
    # config would keep those official features disabled forever after update.
    compression = data.get("compression")
    if isinstance(compression, dict) and compression.get("enabled") is False:
        compression.pop("enabled", None)
    memory = data.get("memory")
    if isinstance(memory, dict) and memory.get("nudge_interval") == 0:
        memory.pop("nudge_interval", None)
    skills = data.get("skills")
    if isinstance(skills, dict) and skills.get("creation_nudge_interval") == 0:
        skills.pop("creation_nudge_interval", None)

    after = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    if after != before or not path.exists():
        atomic_write_text(path, after, 0o600)
        return True
    return False


def patch_profile_env(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    line = "GATEWAY_ALLOW_ALL_USERS='false'"
    pattern = re.compile(r"^GATEWAY_ALLOW_ALL_USERS=.*$", re.M)
    updated = pattern.sub(line, text) if pattern.search(text) else text.rstrip() + "\n" + line + "\n"
    if updated == text and path.exists():
        path.chmod(0o600)
        return False
    atomic_write_text(path, updated, 0o600)
    return True


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        fail(f"Could not patch {label}: expected source block not found")
    return text.replace(old, new, 1)


def patch_title_generator(hermes_agent_root: Path) -> bool:
    path = hermes_agent_root / "agent" / "title_generator.py"
    if not path.exists():
        fail(f"Hermes title generator not found: {path}")

    text = path.read_text(encoding="utf-8")
    original = text

    helper = '''
def _title_generation_enabled() -> bool:
    """Return False when auxiliary.title_generation.enabled is explicitly false."""
    try:
        from hermes_cli.config import load_config

        title_cfg = (
            ((load_config() or {}).get("auxiliary") or {})
            .get("title_generation", {})
        )
        return title_cfg.get("enabled") is not False
    except Exception:
        return True

'''

    if "def _title_generation_enabled(" not in text:
        if "\n\ndef generate_title(" in text:
            text = text.replace("\n\ndef generate_title(", "\n\n" + helper + "def generate_title(", 1)
        elif "\n\ndef auto_title_session(" in text:
            text = text.replace("\n\ndef auto_title_session(", "\n\n" + helper + "def auto_title_session(", 1)
        else:
            fail("Could not patch title generator: no insertion point found")

    if "if not _title_generation_enabled():\n        return None" not in text:
        text = replace_once(
            text,
            "    # Truncate long messages to keep the request small\n",
            "    if not _title_generation_enabled():\n        return None\n\n    # Truncate long messages to keep the request small\n",
            "title_generator.generate_title guard",
        )

    if "if not _title_generation_enabled():\n        return\n\n    # Count user messages" not in text:
        text = replace_once(
            text,
            "    # Count user messages in history to detect first exchange.\n",
            "    if not _title_generation_enabled():\n        return\n\n    # Count user messages in history to detect first exchange.\n",
            "title_generator.maybe_auto_title guard",
        )

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", required=True)
    parser.add_argument("--hermes-agent-root", required=True)
    parser.add_argument("--profiles", default="marketer,copywriter,designer,tech")
    args = parser.parse_args()

    hermes_root = Path(args.hermes_root).expanduser()
    hermes_agent_root = Path(args.hermes_agent_root).expanduser()
    profiles = [p.strip() for p in args.profiles.split(",") if p.strip()]
    yaml = load_yaml_module()

    patched_title = patch_title_generator(hermes_agent_root)
    patched_configs = 0
    patched_envs = 0

    for root in profile_paths(hermes_root, profiles):
        if not root.exists():
            continue
        if patch_config(root / "config.yaml", yaml):
            patched_configs += 1
        if patch_profile_env(root / ".env"):
            patched_envs += 1

    print(
        "Hermes Codex runtime safety: "
        f"title_generator={'patched' if patched_title else 'ok'}, "
        f"configs={patched_configs}, envs={patched_envs}"
    )


if __name__ == "__main__":
    main()
