#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any


REPAIR_REASON = "infobiz_incomplete_assistant_history_repair"


def profile_roots(hermes_root: Path, profiles: list[str]) -> list[tuple[str, Path]]:
    roots: list[tuple[str, Path]] = []
    for profile in profiles:
        profile = profile.strip()
        if not profile:
            continue
        root = hermes_root if profile == "default" else hermes_root / "profiles" / profile
        roots.append((profile, root))
    return roots


def routing_session_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    result: set[str] = set()
    if not isinstance(data, dict):
        return result
    for value in data.values():
        if isinstance(value, dict) and value.get("session_id"):
            result.add(str(value["session_id"]))
        elif isinstance(value, str):
            result.add(value)
    return result


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in conn.execute(f"PRAGMA table_info({table})")}


def candidate_sessions(conn: sqlite3.Connection, routed: set[str]) -> list[dict[str, Any]]:
    if not {"id", "ended_at"}.issubset(table_columns(conn, "sessions")):
        return []
    message_columns = table_columns(conn, "messages")
    if not {"session_id", "role"}.issubset(message_columns):
        return []

    active_filter = "AND COALESCE(m.active, 1) = 1" if "active" in message_columns else ""
    params: list[Any] = []
    routed_filter = ""
    if routed:
        placeholders = ",".join("?" for _ in routed)
        routed_filter = f"AND s.id IN ({placeholders})"
        params.extend(sorted(routed))
    else:
        # Without a routing index, only inspect currently open Telegram sessions.
        source_filter = "AND s.source = 'telegram'" if "source" in table_columns(conn, "sessions") else ""
        routed_filter = source_filter

    rows = conn.execute(
        f"""
        SELECT s.id,
               SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) AS users,
               SUM(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END) AS assistants
          FROM sessions s
          LEFT JOIN messages m ON m.session_id = s.id {active_filter}
         WHERE s.ended_at IS NULL {routed_filter}
         GROUP BY s.id
        """,
        params,
    ).fetchall()

    broken: list[dict[str, Any]] = []
    for session_id, users, assistants in rows:
        users = int(users or 0)
        assistants = int(assistants or 0)
        # Official Hermes #46053 could deliver replies while failing to flush
        # them to state.db. This deliberately conservative threshold avoids
        # rotating a normal short session after one transient provider error.
        if (users >= 10 and assistants <= 1) or (users >= 18 and assistants * 3 < users):
            broken.append({"id": str(session_id), "users": users, "assistants": assistants})
    return broken


def backup_state(db_path: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()


def prune_routing(path: Path, broken_ids: set[str]) -> int:
    if not path.exists() or not broken_ids:
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0
    if not isinstance(data, dict):
        return 0

    removed = 0
    for key in list(data):
        value = data[key]
        session_id = value.get("session_id") if isinstance(value, dict) else value
        if str(session_id or "") in broken_ids:
            del data[key]
            removed += 1
    if not removed:
        return 0

    tmp = path.with_name(f".{path.name}.infobiz.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, path.stat().st_mode & 0o777)
    tmp.replace(path)
    return removed


def repair_profile(profile: str, root: Path, archive_root: Path, apply: bool) -> dict[str, Any]:
    db_path = root / "state.db"
    routing_path = root / "sessions.json"
    result: dict[str, Any] = {"profile": profile, "broken": 0, "repaired": 0, "routes": 0}
    if not db_path.exists():
        return result

    conn = sqlite3.connect(db_path, timeout=30)
    try:
        integrity = str(conn.execute("PRAGMA integrity_check").fetchone()[0])
        if integrity.lower() != "ok":
            raise RuntimeError(f"{profile}: state.db integrity check failed: {integrity}")
        broken = candidate_sessions(conn, routing_session_ids(routing_path))
        result["broken"] = len(broken)
        if not broken or not apply:
            return result

        backup_state(db_path, archive_root / profile / "state.db")
        if routing_path.exists():
            target = archive_root / profile / "sessions.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(routing_path, target)

        now = time.time()
        ids = {item["id"] for item in broken}
        with conn:
            conn.executemany(
                "UPDATE sessions SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL",
                [(now, REPAIR_REASON, session_id) for session_id in sorted(ids)],
            )
        result["repaired"] = len(ids)
        result["routes"] = prune_routing(routing_path, ids)
        return result
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", required=True)
    parser.add_argument("--profiles", default="default,marketer,copywriter,designer,tech")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--archive-root")
    args = parser.parse_args()

    hermes_root = Path(args.hermes_root).expanduser()
    profiles = [item.strip() for item in args.profiles.split(",") if item.strip()]
    stamp = time.strftime("%Y%m%d%H%M%S")
    archive_root = (
        Path(args.archive_root).expanduser()
        if args.archive_root
        else hermes_root / ".archives" / f"session-history-repair.{stamp}"
    )

    results = [
        repair_profile(profile, root, archive_root, args.apply)
        for profile, root in profile_roots(hermes_root, profiles)
        if root.exists()
    ]
    broken = sum(int(item["broken"]) for item in results)
    repaired = sum(int(item["repaired"]) for item in results)
    routes = sum(int(item["routes"]) for item in results)
    if not repaired and archive_root.exists():
        shutil.rmtree(archive_root)
    print(
        "Hermes session history: "
        f"broken={broken}, repaired={repaired}, routing_entries_removed={routes}, "
        f"mode={'apply' if args.apply else 'audit'}"
    )
    if repaired:
        print(f"Backup: {archive_root}")


if __name__ == "__main__":
    main()
