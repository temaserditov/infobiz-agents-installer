#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def atomic_write(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.infobiz.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def patch_typing_refresh(hermes_agent_root: Path) -> bool:
    path = hermes_agent_root / "gateway" / "platforms" / "base.py"
    if not path.exists():
        fail(f"Hermes platform base not found: {path}")

    text = path.read_text(encoding="utf-8")
    marker = "# INFOBIZ_TELEGRAM_TYPING_REFRESH_GUARD"
    if marker in text:
        return False

    anchor = "        # Bound each send_typing round-trip so the refresh cadence isn't\n"
    if anchor not in text:
        fail("Could not patch Hermes typing refresh: expected source block not found")
    guard = (
        "        # INFOBIZ_TELEGRAM_TYPING_REFRESH_GUARD\n"
        "        # A two-second Telegram sendChatAction loop can exhaust the bot's\n"
        "        # flood-control budget during long Codex turns. Other platforms keep\n"
        "        # the official behavior; student Telegram bots default to one initial\n"
        "        # typing event and a completed response.\n"
        "        if (\n"
        "            str(os.getenv(\"HERMES_DISABLE_TELEGRAM_TYPING_REFRESH\", \"\")).lower()\n"
        "            in {\"1\", \"true\", \"yes\", \"on\"}\n"
        "            and _platform_name(self.platform) == \"telegram\"\n"
        "        ):\n"
        "            return\n\n"
    )
    atomic_write(path, text.replace(anchor, guard + anchor, 1))
    return True


def patch_chunk_pacing(hermes_agent_root: Path) -> bool:
    path = hermes_agent_root / "plugins" / "platforms" / "telegram" / "adapter.py"
    if not path.exists():
        fail(f"Hermes Telegram adapter not found: {path}")

    text = path.read_text(encoding="utf-8")
    marker = "# INFOBIZ_TELEGRAM_CHUNK_PACING"
    if marker in text:
        return False

    anchor = "                message_ids.append(str(msg.message_id))\n"
    if anchor not in text:
        fail("Could not patch Telegram chunk pacing: expected send loop not found")
    pacing = (
        anchor
        + "                # INFOBIZ_TELEGRAM_CHUNK_PACING\n"
        + "                # Long answers are split into several Bot API calls. Pace\n"
        + "                # adjacent chunks instead of sending a burst that Telegram\n"
        + "                # can reject with RetryAfter for tens of seconds.\n"
        + "                if i < len(chunks) - 1:\n"
        + "                    delay = self._env_float_clamped(\n"
        + "                        \"HERMES_TELEGRAM_CHUNK_DELAY_SECONDS\",\n"
        + "                        1.2, min_value=0.0, max_value=10.0,\n"
        + "                    )\n"
        + "                    if delay > 0:\n"
        + "                        await asyncio.sleep(delay)\n"
    )
    atomic_write(path, text.replace(anchor, pacing, 1))
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("hermes_agent_root")
    args = parser.parse_args()

    root = Path(args.hermes_agent_root).expanduser()
    typing = patch_typing_refresh(root)
    pacing = patch_chunk_pacing(root)
    print(
        "Hermes Telegram reliability: "
        f"typing_refresh={'patched' if typing else 'ok'}, "
        f"chunk_pacing={'patched' if pacing else 'ok'}"
    )


if __name__ == "__main__":
    main()
