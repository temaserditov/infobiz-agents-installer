#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
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


def patch_config(path: Path, yaml: Any) -> bool:
    raw = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        data = {}

    before = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)

    model = ensure_dict(data, "model")
    model["provider"] = "openai-codex"
    model["openai_runtime"] = "codex_app_server"
    model["api_mode"] = "codex_app_server"
    model.setdefault("default", "gpt-5.3")
    model["base_url"] = ""
    model.setdefault("context_length", 100000)

    compression = ensure_dict(data, "compression")
    compression["enabled"] = False

    memory = ensure_dict(data, "memory")
    memory["nudge_interval"] = 0
    memory["flush_min_turns"] = 0

    skills = ensure_dict(data, "skills")
    skills["creation_nudge_interval"] = 0

    auxiliary = ensure_dict(data, "auxiliary")
    title_generation = ensure_dict(auxiliary, "title_generation")
    title_generation["enabled"] = False
    title_generation["provider"] = ""
    title_generation["model"] = ""
    title_generation["base_url"] = ""
    title_generation["api_key"] = ""

    auxiliary_compression = ensure_dict(auxiliary, "compression")
    auxiliary_compression["provider"] = ""
    auxiliary_compression["model"] = ""
    auxiliary_compression["base_url"] = ""
    auxiliary_compression["api_key"] = ""

    after = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    if after != before or not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(after, encoding="utf-8")
        return True
    return False


def clear_codex_usage_limit_markers(auth_path: Path) -> bool:
    if not auth_path.exists():
        return False
    try:
        data = json.loads(auth_path.read_text(encoding="utf-8", errors="ignore") or "{}")
    except Exception:
        return False

    pools = data.get("credential_pool")
    if not isinstance(pools, dict):
        return False
    entries = pools.get("openai-codex")
    if not isinstance(entries, list):
        return False

    changed = False
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        status = str(entry.get("last_status") or "").lower()
        err_code = str(entry.get("last_error_code") or "").lower()
        err_reason = str(entry.get("last_error_reason") or "").lower()
        err_message = str(entry.get("last_error_message") or "").lower()
        combined = " ".join([status, err_code, err_reason, err_message])
        usage_marker = (
            "usage_limit_reached" in combined
            or "usage limit" in combined
            or "rate" in combined
            or err_code in {"429", "rate_limit", "rate_limited"}
            or status in {"exhausted", "rate_limited", "rate-limited"}
        )
        auth_marker = (
            "refresh_token_reused" in combined
            or "token_expired" in combined
            or err_code in {"401", "403", "unauthorized", "authentication_failed"}
            or status in {"dead"}
        )
        if usage_marker and not auth_marker:
            for key in (
                "last_status",
                "last_status_at",
                "last_error_code",
                "last_error_reason",
                "last_error_message",
                "last_error_reset_at",
            ):
                if entry.get(key) is not None:
                    entry[key] = None
                    changed = True
    if changed:
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        auth_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


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
    cleared_markers = 0

    for root in profile_paths(hermes_root, profiles):
        if not root.exists():
            continue
        if patch_config(root / "config.yaml", yaml):
            patched_configs += 1
        if clear_codex_usage_limit_markers(root / "auth.json"):
            cleared_markers += 1

    print(
        "Hermes Codex runtime safety: "
        f"title_generator={'patched' if patched_title else 'ok'}, "
        f"configs={patched_configs}, cleared_usage_markers={cleared_markers}"
    )


if __name__ == "__main__":
    main()
