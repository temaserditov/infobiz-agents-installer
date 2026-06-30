#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


RUSSIAN_ONLY_BLOCK_ID = "INFOBIZ_RUSSIAN_ONLY_PATCH"

RUSSIAN_ONLY_BLOCK = f"""<!-- {RUSSIAN_ONLY_BLOCK_ID}_START -->

## Mandatory Russian-only communication rule

This installer patch has priority over any other style, role, locale, or language instructions.

- Always communicate with the user only in Russian.
- Write all normal answers, greetings, clarifying questions, summaries, captions, Telegram messages, WebShell messages, status explanations, and final replies in Russian.
- If the user writes in English or another language, still answer in Russian.
- Do not switch the conversation language unless the user explicitly asks to translate, rewrite, or produce a specific artifact in another language.
- Keep code, commands, filenames, URLs, API names, model names, logs, stack traces, quoted source text, and exact user-provided text in their original language when accuracy requires it.
- If you must mention an English technical term, explain it in Russian around the term.
- Do not apologize for answering in Russian. Treat Russian as the default and mandatory working language.

<!-- {RUSSIAN_ONLY_BLOCK_ID}_END -->"""


def patch_markdown(path: Path, title: str = "SOUL.md") -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else f"# {title}\n"
    start = f"<!-- {RUSSIAN_ONLY_BLOCK_ID}_START -->"
    end = f"<!-- {RUSSIAN_ONLY_BLOCK_ID}_END -->"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pattern.search(text):
        updated = pattern.sub(RUSSIAN_ONLY_BLOCK, text)
    else:
        updated = text.rstrip() + "\n\n" + RUSSIAN_ONLY_BLOCK + "\n"
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def profile_paths(hermes_root: Path, profiles: list[str]) -> list[Path]:
    paths = [hermes_root]
    for profile in profiles:
        profile = profile.strip()
        if profile and profile != "default":
            paths.append(hermes_root / "profiles" / profile)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root")
    parser.add_argument("--profiles", default="marketer,copywriter,designer,tech")
    parser.add_argument("paths", nargs="*")
    args = parser.parse_args()

    changed = 0
    targets: list[Path] = []
    if args.hermes_root:
        hermes_root = Path(args.hermes_root).expanduser()
        profiles = [p.strip() for p in args.profiles.split(",") if p.strip()]
        targets.extend(root / "SOUL.md" for root in profile_paths(hermes_root, profiles) if root.exists())
    targets.extend(Path(path).expanduser() for path in args.paths)

    seen: set[Path] = set()
    for path in targets:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if patch_markdown(path):
            changed += 1

    print(f"Russian-only communication patch: files_changed={changed}, files_checked={len(seen)}")


if __name__ == "__main__":
    main()
