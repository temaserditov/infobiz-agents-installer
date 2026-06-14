#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def patch_block(path: Path, title: str, block_id: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else f"# {title}\n"
    start = f"<!-- INFOBIZ_{block_id}_START -->"
    end = f"<!-- INFOBIZ_{block_id}_END -->"
    block = f"{start}\n\n{body.strip()}\n\n{end}"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(text):
        text = pattern.sub(block, text)
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    path.write_text(text, encoding="utf-8")


NO_CODE_BODY = """
## Infobiz no-code default route

This section is an installer patch. It has priority for simple student funnels, bot launches, first payments, lead magnets, mini-diagnostics, applications, and MVP validation.

Default stack for a simple student funnel:

```text
Telegram -> ChatPlace scenario -> lead/application or DM handoff -> Prodamus payment link/page -> manual access/follow-up
```

Hard default:

- Start with ChatPlace for Telegram bot/funnel scenarios.
- Start with Prodamus for payment acceptance when payment is needed.
- Prefer manual access delivery/follow-up first unless the user explicitly needs automation.
- Do not propose Python, PostgreSQL, custom backend, Docker, queues, ORM, webhook code, database schema, or server architecture as the first route for a basic funnel.
- Do not create complexity just because the word "bot" appears.
- Code is allowed only when the user explicitly asks for custom development, ChatPlace/Prodamus cannot solve a specific stated requirement, there is already a validated funnel that needs scaling/integration, or the task is truly a custom integration.
- If code is needed, first explain why ChatPlace/Prodamus is insufficient.

Correct answer to "what do we need for a basic launch through a bot?":

1. Telegram bot connected to ChatPlace.
2. Simple ChatPlace scenario: greeting, context, lead magnet or diagnostic, 1-3 questions, tag/segment only if needed, lead/application or DM handoff.
3. Prodamus payment link/page if payment is needed.
4. Manual delivery/access and follow-up as the fallback.
5. One test path from entry link to application/payment/access.

Forbidden default answer for this class of task:

- "Let's write a bot in Python."
- "Let's create PostgreSQL."
- "Let's build a backend first."
- "Let's design a database schema."
- "Let's deploy a custom webhook service."
"""


CHATPLACE_BODY = """
## Infobiz ChatPlace priority

For student Telegram funnels, ChatPlace is the canonical first route.

Use ChatPlace when the user needs:

- a basic bot;
- a lead magnet;
- buttons and scenarios;
- a mini-diagnostic;
- lead/application collection;
- tags/segments;
- simple material delivery;
- a payment handoff through Prodamus.

Do not replace this with a Python bot unless the user has a concrete requirement that ChatPlace cannot support.
"""


PAYMENTS_BODY = """
## Infobiz Prodamus priority

For first paid offers and simple funnels, Prodamus is the default payment route.

Prefer:

- Prodamus payment link/page;
- clear success/failure redirect if needed;
- manual access delivery first;
- simple notification/table/ChatPlace handoff only when needed.

Do not propose PostgreSQL, custom payment backend, webhook database, or server-side payment integration just to accept a simple payment. Use custom payment code only after explaining why Prodamus link/page is not enough.
"""


COMMAND_BODY = """
## Default route for simple funnels

If the command/request is about a basic bot launch, MVP funnel, lead magnet, first payment, application collection, or "what do we need to start", answer from this route first:

```text
Telegram -> ChatPlace -> Prodamus -> manual access/follow-up
```

Do not start with Python, PostgreSQL, custom backend, Docker, webhook code, or database design.
"""


def main() -> int:
    if len(sys.argv) != 2:
        fail("Usage: patch-tech-no-code-defaults.py /path/to/tech-profile")
    root = Path(sys.argv[1]).expanduser().resolve()
    if not root.exists():
        fail(f"Tech profile root does not exist: {root}")

    patch_block(root / "SOUL.md", "SOUL.md", "TECH_NO_CODE_DEFAULTS", NO_CODE_BODY)
    patch_block(root / "AGENTS.md", "AGENTS.md", "TECH_NO_CODE_DEFAULTS", NO_CODE_BODY)
    patch_block(root / "COMMANDS.md", "COMMANDS.md", "TECH_NO_CODE_DEFAULTS", COMMAND_BODY)
    patch_block(root / "skills/no-code-mvp-stack/SKILL.md", "no-code-mvp-stack", "TECH_NO_CODE_DEFAULTS", NO_CODE_BODY)
    patch_block(root / "skills/chatplace-basic-setup/SKILL.md", "chatplace-basic-setup", "TECH_CHATPLACE_PRIORITY", CHATPLACE_BODY)
    patch_block(root / "knowledge/04-payments.md", "04-payments", "TECH_PRODAMUS_PRIORITY", PAYMENTS_BODY)
    print(f"Patched tech no-code defaults in {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
