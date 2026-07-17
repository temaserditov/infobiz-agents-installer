#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


def seed_profile(root: Path) -> None:
    root.mkdir(parents=True)
    conn = sqlite3.connect(root / "state.db")
    conn.executescript(
        """
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            started_at REAL NOT NULL,
            ended_at REAL,
            end_reason TEXT
        );
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            active INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    conn.executemany(
        "INSERT INTO sessions(id, source, started_at) VALUES (?, 'telegram', 1)",
        [("broken",), ("healthy",)],
    )
    conn.executemany(
        "INSERT INTO messages(session_id, role, content) VALUES ('broken', 'user', ?)",
        [(f"u{i}",) for i in range(12)],
    )
    conn.execute("INSERT INTO messages(session_id, role, content) VALUES ('broken', 'assistant', 'a')")
    for i in range(6):
        conn.execute("INSERT INTO messages(session_id, role, content) VALUES ('healthy', 'user', ?)", (f"u{i}",))
        conn.execute("INSERT INTO messages(session_id, role, content) VALUES ('healthy', 'assistant', ?)", (f"a{i}",))
    conn.commit()
    conn.close()
    (root / "sessions.json").write_text(
        json.dumps(
            {
                "_README": "routing",
                "agent:broken": {"session_id": "broken"},
                "agent:healthy": {"session_id": "healthy"},
            }
        ),
        encoding="utf-8",
    )


def main() -> None:
    script = Path(__file__).with_name("repair-hermes-session-history.py")
    with tempfile.TemporaryDirectory(prefix="infobiz-session-repair-") as tmp:
        root = Path(tmp) / "hermes"
        profile = root / "profiles" / "marketer"
        archive = Path(tmp) / "backup"
        seed_profile(profile)
        subprocess.run(
            [
                sys.executable,
                str(script),
                "--hermes-root",
                str(root),
                "--profiles",
                "marketer",
                "--archive-root",
                str(archive),
                "--apply",
            ],
            check=True,
        )

        conn = sqlite3.connect(profile / "state.db")
        rows = dict(conn.execute("SELECT id, end_reason FROM sessions").fetchall())
        conn.close()
        assert rows["broken"] == "infobiz_incomplete_assistant_history_repair"
        assert rows["healthy"] is None
        routing = json.loads((profile / "sessions.json").read_text(encoding="utf-8"))
        assert "agent:broken" not in routing
        assert routing["agent:healthy"]["session_id"] == "healthy"
        assert (archive / "marketer" / "state.db").exists()
        assert (archive / "marketer" / "sessions.json").exists()
    print("Hermes session history repair smoke passed.")


if __name__ == "__main__":
    main()
