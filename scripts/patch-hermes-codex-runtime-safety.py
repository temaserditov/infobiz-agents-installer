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
    # Keep operational lifecycle chatter in logs. Students should see the
    # completed answer (or one final error), not internal timers and retries.
    display["tool_progress"] = "off"
    display["long_running_notifications"] = False
    display["busy_ack_detail"] = False
    platforms = ensure_dict(display, "platforms")
    telegram = ensure_dict(platforms, "telegram")
    telegram["streaming"] = False
    telegram["tool_progress"] = "off"
    telegram["long_running_notifications"] = False
    telegram["busy_ack_detail"] = False

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
    updated = text
    required = {
        "GATEWAY_ALLOW_ALL_USERS": "false",
        # Hermes defaults to just 12 seconds after the first SSE event for a
        # small Codex request. GPT-5.5 can legitimately stay silent longer
        # while reasoning, so retain recovery but avoid false reconnects.
        "HERMES_CODEX_EVENT_STALE_TIMEOUT_SECONDS": "120",
        "HERMES_CODEX_TTFB_TIMEOUT_SECONDS": "120",
        # Continuous sendChatAction calls every two seconds consumed Telegram's
        # flood-control budget during slow Codex turns. One initial typing event
        # is enough; long answers are separately paced by the transport patch.
        "HERMES_DISABLE_TELEGRAM_TYPING_REFRESH": "true",
        "HERMES_TELEGRAM_CHUNK_DELAY_SECONDS": "1.2",
    }
    for key, value in required.items():
        line = f"{key}='{value}'"
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
        if pattern.search(updated):
            updated = pattern.sub(line, updated)
        else:
            updated = updated.rstrip() + "\n" + line + "\n"
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


def patch_gateway_status_filter(hermes_agent_root: Path) -> bool:
    path = hermes_agent_root / "gateway" / "run.py"
    if not path.exists():
        fail(f"Hermes gateway runtime not found: {path}")

    text = path.read_text(encoding="utf-8")
    original = text
    additions = (
        '    r"|codex\\s+stream\\s+sent\\s+no\\s+events"\n'
        '    r"|no\\s+response\\s+from\\s+provider\\s+for\\s+\\d+s"\n'
    )
    if "codex\\s+stream\\s+sent\\s+no\\s+events" not in text:
        marker = '    r"|stale\\s+connections\\s+from\\s+a\\s+previous\\s+provider\\s+issue"\n'
        if marker not in text:
            fail("Could not patch Hermes gateway status filter: insertion point not found")
        text = text.replace(marker, marker + additions, 1)

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def patch_gateway_message_logging(hermes_agent_root: Path) -> bool:
    path = hermes_agent_root / "gateway" / "run.py"
    if not path.exists():
        fail(f"Hermes gateway runtime not found: {path}")

    text = path.read_text(encoding="utf-8")
    marker = "INFOBIZ_PRIVACY_SAFE_INBOUND_LOG"
    if marker in text:
        return False

    old = '''        _msg_preview = (event.text or "")[:80].replace("\\n", " ")
        _reply_id = getattr(event, "reply_to_message_id", None)
        _reply_txt = (getattr(event, "reply_to_text", None) or "")[:80].replace("\\n", " ")
        logger.info(
            "inbound message: platform=%s user=%s chat=%s msg=%r reply_to_id=%s reply_to_text=%r",
            _platform_name, source.user_name or source.user_id or "unknown",
            source.chat_id or "unknown", _msg_preview, _reply_id, _reply_txt,
        )
'''
    new = '''        # INFOBIZ_PRIVACY_SAFE_INBOUND_LOG
        # Logs are routinely shared for support. Keep operational dimensions,
        # never a user's name, Telegram ID, prompt, or quoted message text.
        _message_chars = len(event.text or "")
        _has_reply = bool(
            getattr(event, "reply_to_message_id", None)
            or getattr(event, "reply_to_text", None)
        )
        logger.info(
            "inbound message: platform=%s text_chars=%s has_reply=%s",
            _platform_name, _message_chars, _has_reply,
        )
'''
    if old not in text:
        fail("Could not patch Hermes inbound logging: expected source block not found")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


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
    patched_status_filter = patch_gateway_status_filter(hermes_agent_root)
    patched_message_logging = patch_gateway_message_logging(hermes_agent_root)
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
        f"status_filter={'patched' if patched_status_filter else 'ok'}, "
        f"message_logging={'patched' if patched_message_logging else 'ok'}, "
        f"configs={patched_configs}, envs={patched_envs}"
    )


if __name__ == "__main__":
    main()
