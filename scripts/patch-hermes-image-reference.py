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


def patch_openai_codex(root: Path) -> None:
    path = root / "plugins/image_gen/openai-codex/__init__.py"
    if not path.exists():
        fail(f"OpenAI Codex image provider not found: {path}")
    text = path.read_text(encoding="utf-8")

    if "import base64\n" not in text:
        text = text.replace("import json\n", "import json\nimport base64\n", 1)
    if "import mimetypes\n" not in text:
        text = text.replace("import logging\n", "import logging\nimport mimetypes\n", 1)
    if "from pathlib import Path\n" not in text:
        text = text.replace("from __future__ import annotations\n\n", "from __future__ import annotations\n\nfrom pathlib import Path\n", 1)

    helper = '''def _coerce_reference_image_url(reference_image: Any) -> Optional[str]:
    if reference_image is None:
        return None
    value = str(reference_image).strip()
    if not value:
        return None
    if value.startswith(("data:image/", "http://", "https://")):
        return value
    path = Path(value).expanduser()
    if not path.exists() or not path.is_file():
        return None
    mime = mimetypes.guess_type(str(path))[0] or "image/png"
    raw = path.read_bytes()
    return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")


def _build_input_content(*, prompt: str, reference_image: Any = None) -> List[Dict[str, Any]]:
    content: List[Dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    reference_image_url = _coerce_reference_image_url(reference_image)
    if reference_image_url:
        content.append({"type": "input_image", "image_url": reference_image_url})
    return content


'''

    if "_coerce_reference_image_url" not in text:
        if "def _build_responses_payload(" in text:
            text = text.replace("def _build_responses_payload(", helper + "def _build_responses_payload(", 1)
        elif "def _collect_image_b64(" in text:
            text = text.replace("def _collect_image_b64(", helper + "def _collect_image_b64(", 1)
        else:
            fail("Could not patch openai-codex reference helper: no payload/collector function found")

    if "def _build_responses_payload(" in text:
        text = replace_once(
            text,
            "def _build_responses_payload(*, prompt: str, size: str, quality: str) -> Dict[str, Any]:\n",
            "def _build_responses_payload(*, prompt: str, size: str, quality: str, reference_image: Any = None) -> Dict[str, Any]:\n",
            "openai-codex payload signature",
        )

        text = replace_once(
            text,
            '            "content": [{"type": "input_text", "text": prompt}],\n',
            '            "content": _build_input_content(prompt=prompt, reference_image=reference_image),\n',
            "openai-codex input content",
        )

        text = replace_once(
            text,
            "def _collect_image_b64(token: str, *, prompt: str, size: str, quality: str) -> Optional[str]:\n",
            "def _collect_image_b64(token: str, *, prompt: str, size: str, quality: str, reference_image: Any = None) -> Optional[str]:\n",
            "openai-codex collector signature",
        )

        text = replace_once(
            text,
            "    payload = _build_responses_payload(prompt=prompt, size=size, quality=quality)\n",
            "    payload = _build_responses_payload(prompt=prompt, size=size, quality=quality, reference_image=reference_image)\n",
            "openai-codex payload reference arg",
        )
    else:
        text = replace_once(
            text,
            'def _collect_image_b64(client: Any, *, prompt: str, size: str, quality: str) -> Optional[str]:\n'
            '    """Stream a Codex Responses image_generation call and return the b64 image."""\n'
            '    image_b64: Optional[str] = None\n\n'
            '    with client.responses.stream(\n',
            'def _collect_image_b64(\n'
            '    client: Any,\n'
            '    *,\n'
            '    prompt: str,\n'
            '    size: str,\n'
            '    quality: str,\n'
            '    reference_image: Any = None,\n'
            ') -> Optional[str]:\n'
            '    """Stream a Codex Responses image_generation call and return the b64 image."""\n'
            '    image_b64: Optional[str] = None\n'
            '    content = _build_input_content(prompt=prompt, reference_image=reference_image)\n\n'
            '    with client.responses.stream(\n',
            "openai-codex legacy collector signature",
        )

        text = replace_once(
            text,
            '            "content": [{"type": "input_text", "text": prompt}],\n',
            '            "content": content,\n',
            "openai-codex legacy input content",
        )

    text = replace_once(
        text,
        '                quality=meta["quality"],\n'
        '            )\n',
        '                quality=meta["quality"],\n'
        '                reference_image=kwargs.get("reference_image") or kwargs.get("source_image") or kwargs.get("input_image"),\n'
        '            )\n',
        "openai-codex generate reference arg",
    )

    text = replace_once(
        text,
        '            extra={"size": size, "quality": meta["quality"]},\n',
        '            extra={\n'
        '                "size": size,\n'
        '                "quality": meta["quality"],\n'
        '                "reference_image": bool(kwargs.get("reference_image") or kwargs.get("source_image") or kwargs.get("input_image")),\n'
        '            },\n',
        "openai-codex response metadata",
    )

    path.write_text(text, encoding="utf-8")


def patch_image_tool(root: Path) -> None:
    path = root / "tools/image_generation_tool.py"
    if not path.exists():
        fail(f"image_generation_tool.py not found: {path}")
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "def image_generate_tool(\n"
        "    prompt: str,\n"
        "    aspect_ratio: str = DEFAULT_ASPECT_RATIO,\n",
        "def image_generate_tool(\n"
        "    prompt: str,\n"
        "    aspect_ratio: str = DEFAULT_ASPECT_RATIO,\n"
        "    reference_image: Optional[str] = None,\n",
        "image_generate_tool signature",
    )

    text = replace_once(
        text,
        '            "aspect_ratio": aspect_ratio,\n'
        '            "num_inference_steps": num_inference_steps,\n',
        '            "aspect_ratio": aspect_ratio,\n'
        '            "reference_image": reference_image,\n'
        '            "num_inference_steps": num_inference_steps,\n',
        "image_generate debug params",
    )

    text = replace_once(
        text,
        "def _dispatch_to_plugin_provider(prompt: str, aspect_ratio: str):\n",
        "def _dispatch_to_plugin_provider(prompt: str, aspect_ratio: str, **provider_kwargs):\n",
        "plugin dispatch signature",
    )

    if "kwargs.update({k: v for k, v in provider_kwargs.items() if v is not None})" not in text:
        if "        result = provider.generate(prompt=prompt, aspect_ratio=aspect_ratio)\n" in text:
            text = text.replace(
                "        result = provider.generate(prompt=prompt, aspect_ratio=aspect_ratio)\n",
                "        kwargs = {\"prompt\": prompt, \"aspect_ratio\": aspect_ratio}\n"
                "        kwargs.update({k: v for k, v in provider_kwargs.items() if v is not None})\n"
                "        result = provider.generate(**kwargs)\n",
                1,
            )
        elif (
            '        kwargs = {"prompt": prompt, "aspect_ratio": aspect_ratio}\n'
            "        if configured_model:\n"
            '            kwargs["model"] = configured_model\n'
            "        result = provider.generate(**kwargs)\n"
        ) in text:
            text = text.replace(
                '        kwargs = {"prompt": prompt, "aspect_ratio": aspect_ratio}\n'
                "        if configured_model:\n"
                '            kwargs["model"] = configured_model\n'
                "        result = provider.generate(**kwargs)\n",
                '        kwargs = {"prompt": prompt, "aspect_ratio": aspect_ratio}\n'
                "        kwargs.update({k: v for k, v in provider_kwargs.items() if v is not None})\n"
                "        if configured_model:\n"
                '            kwargs["model"] = configured_model\n'
                "        result = provider.generate(**kwargs)\n",
                1,
            )
        else:
            fail("Could not patch plugin dispatch kwargs: expected provider.generate block not found")

    text = replace_once(
        text,
        '        "Generate high-quality images from text prompts. The underlying "\n',
        '        "Generate high-quality images from text prompts, optionally using one "\n'
        '        "reference image for image-to-image/edit-style tasks. The underlying "\n',
        "tool description",
    )

    schema_old = """            "aspect_ratio": {
                "type": "string",
                "enum": list(VALID_ASPECT_RATIOS),
                "description": "The aspect ratio of the generated image. 'landscape' is 16:9 wide, 'portrait' is 16:9 tall, 'square' is 1:1.",
                "default": DEFAULT_ASPECT_RATIO,
            },
"""
    schema_new = """            "aspect_ratio": {
                "type": "string",
                "enum": list(VALID_ASPECT_RATIOS),
                "description": "The aspect ratio of the generated image. 'landscape' is 16:9 wide, 'portrait' is 16:9 tall, 'square' is 1:1.",
                "default": DEFAULT_ASPECT_RATIO,
            },
            "reference_image": {
                "type": "string",
                "description": (
                    "Optional local image path, data URL, or http(s) URL to use as an input/reference image. "
                    "Use this whenever the user attached an existing image/person and asked to preserve identity, "
                    "face, pose, style, background, or edit/extend the source image. Do not use plain text-only "
                    "generation for face-preservation tasks."
                ),
            },
"""
    text = replace_once(text, schema_old, schema_new, "tool schema reference_image")

    text = replace_once(
        text,
        '    aspect_ratio = args.get("aspect_ratio", DEFAULT_ASPECT_RATIO)\n',
        '    aspect_ratio = args.get("aspect_ratio", DEFAULT_ASPECT_RATIO)\n'
        '    reference_image = args.get("reference_image") or args.get("source_image") or args.get("input_image")\n',
        "handler reference arg",
    )

    text = replace_once(
        text,
        "    dispatched = _dispatch_to_plugin_provider(prompt, aspect_ratio)\n",
        "    dispatched = _dispatch_to_plugin_provider(prompt, aspect_ratio, reference_image=reference_image)\n",
        "handler dispatch reference",
    )

    text = replace_once(
        text,
        "        prompt=prompt,\n"
        "        aspect_ratio=aspect_ratio,\n"
        "    )\n",
        "        prompt=prompt,\n"
        "        aspect_ratio=aspect_ratio,\n"
        "        reference_image=reference_image,\n"
        "    )\n",
        "handler fallback reference",
    )

    path.write_text(text, encoding="utf-8")


def main() -> int:
    root_arg = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HERMES_AGENT_ROOT", "")
    root = Path(root_arg).expanduser().resolve()
    if not root.exists():
        fail(f"Hermes agent root does not exist: {root}")
    patch_openai_codex(root)
    patch_image_tool(root)
    print(f"Patched Hermes image reference support in {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
