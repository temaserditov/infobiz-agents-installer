#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path

WEB_FORBIDDEN_TOOLSETS = {
    "browser",
    "chatplace",
    "code_execution",
    "cronjob",
    "delegation",
    "file",
    "kanban",
    "memory",
    "session_search",
    "terminal",
    "todo",
    "tts",
}


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--session-id", required=True)
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument("--prompt")
    prompt_group.add_argument("--prompt-stdin", action="store_true")
    parser.add_argument("--history-json", default="")
    args = parser.parse_args()

    prompt = sys.stdin.read() if args.prompt_stdin else (args.prompt or "")
    if len(prompt) > 200_000:
        emit({"type": "run.failed", "error": "Prompt is too large"})
        return 1

    session_id = args.session_id
    approval_dir = Path(os.environ["AGENT_WEB_APPROVAL_DIR"])
    approval_dir.mkdir(parents=True, exist_ok=True)

    os.environ["HERMES_GATEWAY_SESSION"] = "1"
    os.environ["HERMES_SESSION_KEY"] = session_id
    os.environ.pop("HERMES_YOLO_MODE", None)
    hermes_home = Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")

    try:
        from hermes_cli.env_loader import load_hermes_dotenv

        load_hermes_dotenv(hermes_home=hermes_home)
    except Exception as exc:
        emit({"type": "env.load_warning", "profile": args.profile, "hermesHome": str(hermes_home), "error": str(exc)})

    try:
        from hermes_cli.config import load_config
        from hermes_cli.models import detect_provider_for_model
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from hermes_cli.tools_config import _get_platform_tools
        from run_agent import AIAgent
        from tools.approval import (
            register_gateway_notify,
            resolve_gateway_approval,
            set_current_session_key,
            reset_current_session_key,
            unregister_gateway_notify,
        )
    except Exception as exc:
        emit({"type": "run.failed", "error": f"Hermes import failed: {exc}"})
        return 1

    def wait_for_decision(approval_id: str) -> None:
        path = approval_dir / f"{approval_id}.json"
        deadline = time.time() + 300
        decision = "deny"
        while time.time() < deadline:
            if path.exists():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    decision = str(data.get("decision") or "deny")
                except Exception:
                    decision = "deny"
                break
            time.sleep(0.25)
        if decision not in {"once", "session", "always", "deny"}:
            decision = "deny"
        count = resolve_gateway_approval(session_id, decision)
        emit({"type": "approval.resolved", "approvalId": approval_id, "decision": decision, "count": count})

    def approval_notify(approval_data: dict) -> None:
        approval_id = uuid.uuid4().hex
        emit({
            "type": "approval.requested",
            "approvalId": approval_id,
            "sessionId": session_id,
            "command": approval_data.get("command", ""),
            "description": approval_data.get("description", ""),
            "patternKey": approval_data.get("pattern_key", ""),
            "patternKeys": approval_data.get("pattern_keys", []),
        })
        threading.Thread(target=wait_for_decision, args=(approval_id,), daemon=True).start()

    def stream_delta(delta: str | None) -> None:
        if delta:
            emit({"type": "message.delta", "delta": delta})

    def tool_progress(event: dict) -> None:
        if isinstance(event, dict):
            emit({"type": "tool.event", "event": event})

    def clarify_callback(question: str, choices=None) -> str:
        emit({"type": "clarify.auto", "question": question, "choices": choices or []})
        return "[web shell MVP: choose the most reasonable option and continue.]"

    token = set_current_session_key(session_id)
    register_gateway_notify(session_id, approval_notify)
    try:
        cfg = load_config()
        model_cfg = cfg.get("model") or {}
        cfg_model = model_cfg if isinstance(model_cfg, str) else (model_cfg.get("default") or model_cfg.get("model") or "")
        effective_model = os.getenv("HERMES_INFERENCE_MODEL", "").strip() or cfg_model
        effective_provider = os.getenv("HERMES_INFERENCE_PROVIDER", "").strip() or None

        if effective_provider is None and effective_model:
            cfg_provider = ""
            if isinstance(model_cfg, dict):
                cfg_provider = str(model_cfg.get("provider") or "").strip().lower()
            detected = detect_provider_for_model(effective_model, cfg_provider or "auto")
            if detected:
                effective_provider, effective_model = detected

        runtime = resolve_runtime_provider(
            requested=effective_provider,
            target_model=effective_model or None,
        )
        tool_mode = os.getenv("AGENT_WEB_TOOL_MODE", "focused").strip().lower() or "focused"
        configured_web_toolsets = (cfg.get("platform_toolsets") or {}).get("web")
        if os.getenv("AGENT_WEB_TOOLSETS", "").strip():
            toolsets = sorted(item.strip() for item in os.getenv("AGENT_WEB_TOOLSETS", "").split(",") if item.strip())
        elif tool_mode == "full":
            toolsets = sorted(_get_platform_tools(cfg, "cli"))
        elif tool_mode == "quick":
            toolsets = ["clarify", "code_execution", "file", "terminal", "vision", "web"]
        else:
            # Default for the browser shell: use the controlled web surface
            # from the profile config. Skills stay available, heavyweight
            # autonomous loops stay off unless the profile explicitly opts in.
            if isinstance(configured_web_toolsets, list):
                toolsets = sorted(_get_platform_tools(cfg, "web"))
            else:
                toolsets = ["clarify", "code_execution", "file", "messaging", "skills", "terminal", "vision", "web"]
        blocked_toolsets = sorted(item for item in toolsets if item in WEB_FORBIDDEN_TOOLSETS)
        if blocked_toolsets:
            toolsets = sorted(item for item in toolsets if item not in WEB_FORBIDDEN_TOOLSETS)
            emit({"type": "toolsets.filtered", "blocked": blocked_toolsets, "toolMode": tool_mode})

        emit({
            "type": "agent.ready",
            "profile": args.profile,
            "sessionId": session_id,
            "model": effective_model,
            "provider": runtime.get("provider"),
            "toolsets": toolsets,
            "toolMode": tool_mode,
            "obsidianVault": os.getenv("OBSIDIAN_VAULT", ""),
        })

        agent = AIAgent(
            api_key=runtime.get("api_key"),
            base_url=runtime.get("base_url"),
            provider=runtime.get("provider"),
            api_mode=runtime.get("api_mode"),
            model=effective_model,
            enabled_toolsets=toolsets,
            quiet_mode=True,
            verbose_logging=False,
            platform="web",
            session_id=session_id,
            credential_pool=runtime.get("credential_pool"),
            stream_delta_callback=stream_delta,
            tool_progress_callback=tool_progress,
            clarify_callback=clarify_callback,
        )

        conversation_history = []
        if args.history_json:
            try:
                history_path = Path(args.history_json)
                loaded = json.loads(history_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    conversation_history = [
                        item for item in loaded
                        if isinstance(item, dict)
                        and item.get("role") in {"user", "assistant"}
                        and isinstance(item.get("content"), str)
                    ]
            except Exception as exc:
                emit({"type": "history.load_failed", "error": str(exc), "path": args.history_json})

        result = agent.run_conversation(
            user_message=prompt,
            conversation_history=conversation_history,
            task_id=session_id,
        )
        final = result.get("final_response", "") if isinstance(result, dict) else str(result or "")
        emit({
            "type": "run.completed",
            "output": final,
            "usage": {
                "inputTokens": getattr(agent, "session_prompt_tokens", 0) or 0,
                "outputTokens": getattr(agent, "session_completion_tokens", 0) or 0,
                "totalTokens": getattr(agent, "session_total_tokens", 0) or 0,
                "apiCalls": getattr(agent, "session_api_calls", 0) or 0,
            },
        })
        return 0
    except KeyboardInterrupt:
        emit({"type": "run.stopped"})
        return 130
    except Exception as exc:
        emit({"type": "run.failed", "error": str(exc)})
        return 1
    finally:
        unregister_gateway_notify(session_id)
        reset_current_session_key(token)


if __name__ == "__main__":
    raise SystemExit(main())
