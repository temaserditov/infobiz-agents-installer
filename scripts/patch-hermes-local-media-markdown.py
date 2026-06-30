#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        fail(f"Could not patch {label}: expected source block not found")
    return text.replace(old, new, 1)


def patch_base_adapter(root: Path) -> None:
    path = root / "gateway/platforms/base.py"
    if not path.exists():
        fail(f"Hermes base platform adapter not found: {path}")

    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        """        path_re = re.compile(
            r'(?<![/:\\w.])(?:~/|/|[A-Za-z]:[/\\\\])(?:[\\w.\\-]+[/\\\\])*[\\w.\\-]+\\.(?:' + ext_part + r')\\b',
            re.IGNORECASE,
        )
""",
        """        # Local files may be returned as Markdown links by Codex, especially
        # when filenames contain spaces:
        #   [result](</Users/me/Downloads/my file.png>)
        # The bare-path matcher below intentionally stays conservative, so
        # handle Markdown links explicitly and remove the whole link from the
        # visible text after native delivery.
        markdown_path_re = re.compile(
            r'!?\\[[^\\]\\n]*\\]\\(\\s*<?(?P<path>(?:~/|/|[A-Za-z]:[/\\\\])[^<>\\r\\n]+?\\.(?:' + ext_part + r'))>?\\s*\\)',
            re.IGNORECASE,
        )

        path_re = re.compile(
            r'(?<![/:\\w.])(?:~/|/|[A-Za-z]:[/\\\\])(?:[\\w.\\-]+[/\\\\])*[\\w.\\-]+\\.(?:' + ext_part + r')\\b',
            re.IGNORECASE,
        )
""",
        "local media markdown regex",
    )

    text = replace_once(
        text,
        """        found: list = []  # (raw_match_text, expanded_path)
        for match in path_re.finditer(content):
""",
        """        found: list = []  # (raw_match_text_to_remove, expanded_path)
        for match in markdown_path_re.finditer(content):
            if _in_code(match.start()):
                continue
            raw = match.group(0)
            raw_path = (match.group("path") or "").strip()
            expanded = os.path.expanduser(raw_path)
            if os.path.isfile(expanded):
                found.append((raw, expanded))
            else:
                logger.info(
                    "Skipping Markdown file link in reply (no file on disk): %s",
                    _log_safe_path(raw_path),
                )

        for match in path_re.finditer(content):
""",
        "local media markdown extraction",
    )

    path.write_text(text, encoding="utf-8")


def main() -> int:
    root_arg = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HERMES_AGENT_ROOT", "")
    root = Path(root_arg).expanduser().resolve()
    if not root.exists():
        fail(f"Hermes agent root does not exist: {root}")
    patch_base_adapter(root)
    print(f"Patched local media Markdown delivery support in {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
