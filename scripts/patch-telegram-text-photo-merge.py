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


def patch_adapter(root: Path) -> None:
    path = root / "plugins/platforms/telegram/adapter.py"
    if not path.exists():
        fail(f"Telegram adapter not found: {path}")
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        """        self._text_batch_split_delay_seconds = self._env_float_clamped(
            "HERMES_TELEGRAM_TEXT_BATCH_SPLIT_DELAY_SECONDS",
            1.0,
            min_value=self._text_batch_delay_seconds,
            max_value=4.0,
        )
        self._pending_text_batches: Dict[str, MessageEvent] = {}
""",
        """        self._text_batch_split_delay_seconds = self._env_float_clamped(
            "HERMES_TELEGRAM_TEXT_BATCH_SPLIT_DELAY_SECONDS",
            1.0,
            min_value=self._text_batch_delay_seconds,
            max_value=4.0,
        )
        # Infobiz patch: Telegram sometimes delivers a caption-like text task
        # and the attached photo as separate updates. Short text batches used
        # to flush in ~180ms, so Hermes would start a text-only turn and later
        # route the photo as the generic "What do you see in this image?"
        # follow-up. Image-task text waits a little longer so the photo can
        # merge into the same MessageEvent.
        self._text_photo_merge_delay_seconds = self._env_float_clamped(
            "HERMES_TELEGRAM_TEXT_PHOTO_MERGE_DELAY_SECONDS",
            1.4,
            min_value=self._media_batch_delay_seconds,
            max_value=5.0,
        )
        self._pending_text_batches: Dict[str, MessageEvent] = {}
""",
        "telegram text-photo merge delay",
    )

    helper = '''    def _looks_like_image_task_text(self, text: str) -> bool:
        """Return True when text likely expects a near-future image upload."""
        value = (text or "").lower()
        if not value.strip():
            return False
        image_terms = (
            "фото", "фотограф", "картин", "изображ", "баннер",
            "облож", "креатив", "визуал", "референс",
            "image", "photo", "picture", "banner", "cover", "creative", "visual",
        )
        action_terms = (
            "возьми", "добав", "сдел", "сгенер", "нарис", "созд",
            "измени", "поменя", "дорис", "расшир", "замени", "налож",
            "edit", "add", "generate", "create", "make", "draw",
            "change", "extend", "outpaint", "inpaint",
        )
        return any(term in value for term in image_terms) and any(term in value for term in action_terms)

    def _merge_pending_photo_batches_into_text_event(self, text_key: str, event: MessageEvent) -> None:
        """Merge queued Telegram photo bursts/albums into a matching text event."""
        prefixes = (f"{text_key}:photo-burst", f"{text_key}:album:")
        for batch_key, pending in list(self._pending_photo_batches.items()):
            if not (batch_key == prefixes[0] or batch_key.startswith(prefixes[1])):
                continue
            if pending.media_urls:
                event.media_urls.extend(pending.media_urls)
                event.media_types.extend(pending.media_types)
            if pending.text:
                event.text = self._merge_caption(event.text, pending.text)
            self._pending_photo_batches.pop(batch_key, None)
            prior_task = self._pending_photo_batch_tasks.pop(batch_key, None)
            if prior_task and not prior_task.done():
                prior_task.cancel()
            logger.info(
                "[Telegram] Merged pending photo batch %s into text batch %s (%d image(s))",
                batch_key,
                text_key,
                len(getattr(pending, "media_urls", None) or []),
            )

'''
    if "_looks_like_image_task_text" not in text:
        text = replace_once(
            text,
            "    def _enqueue_text_event(self, event: MessageEvent) -> None:\n",
            helper + "    def _enqueue_text_event(self, event: MessageEvent) -> None:\n",
            "telegram helper methods",
        )

    text = replace_once(
        text,
        """        key = self._text_batch_key(event)
        existing = self._pending_text_batches.get(key)
""",
        """        key = self._text_batch_key(event)
        self._merge_pending_photo_batches_into_text_event(key, event)
        existing = self._pending_text_batches.get(key)
""",
        "text enqueue pending-photo merge",
    )

    text = replace_once(
        text,
        """            else:
                delay = self._text_batch_delay_seconds
            await asyncio.sleep(delay)
""",
        """            else:
                delay = self._text_batch_delay_seconds
            if (
                pending
                and not getattr(pending, "media_urls", None)
                and self._looks_like_image_task_text(getattr(pending, "text", "") or "")
            ):
                delay = max(delay, self._text_photo_merge_delay_seconds)
                logger.debug(
                    "[Telegram] Holding image-task text batch %s for %.2fs to merge near-future photos",
                    key,
                    delay,
                )
            await asyncio.sleep(delay)
""",
        "text flush image-task hold",
    )

    text = replace_once(
        text,
        """    def _enqueue_photo_event(self, batch_key: str, event: MessageEvent) -> None:
        \"\"\"Merge photo events into a pending batch and schedule flush.\"\"\"
        existing = self._pending_photo_batches.get(batch_key)
""",
        """    def _enqueue_photo_event(self, batch_key: str, event: MessageEvent) -> None:
        \"\"\"Merge photo events into a pending batch and schedule flush.\"\"\"
        text_key = self._text_batch_key(event)
        pending_text = self._pending_text_batches.get(text_key)
        if pending_text is not None:
            if event.media_urls:
                pending_text.media_urls.extend(event.media_urls)
                pending_text.media_types.extend(event.media_types)
            if event.text:
                pending_text.text = self._merge_caption(pending_text.text, event.text)
            prior_task = self._pending_text_batch_tasks.get(text_key)
            if prior_task and not prior_task.done():
                prior_task.cancel()
            self._pending_text_batch_tasks[text_key] = asyncio.create_task(
                self._flush_text_batch(text_key)
            )
            logger.info(
                "[Telegram] Merged photo batch %s into pending text batch %s (%d image(s))",
                batch_key,
                text_key,
                len(event.media_urls or []),
            )
            return

        existing = self._pending_photo_batches.get(batch_key)
""",
        "photo enqueue pending-text merge",
    )

    path.write_text(text, encoding="utf-8")


def main() -> int:
    root_arg = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HERMES_AGENT_ROOT", "")
    root = Path(root_arg).expanduser().resolve()
    if not root.exists():
        fail(f"Hermes agent root does not exist: {root}")
    patch_adapter(root)
    print(f"Patched Telegram text/photo merge support in {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
