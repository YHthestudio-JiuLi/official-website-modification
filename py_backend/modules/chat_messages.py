from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class ChatMessageManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
              body TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)"
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM chat_messages ORDER BY created_at ASC, id ASC")
        return [dict(row) for row in self.cur.fetchall()]

    def find_by_id(self, message_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT id, session_id, sender, body, created_at FROM chat_messages WHERE id = ?",
            (message_id,),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def find_by_session_id(self, session_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT id, session_id, sender, body, created_at
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (session_id, limit),
        )
        return [dict(row) for row in self.cur.fetchall()]

    def create(self, session_id: str, sender: str, body: str) -> Optional[Dict[str, Any]]:
        text = body.strip()
        if not text:
            return None
        session_exists = self.cur.execute(
            "SELECT 1 FROM chat_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session_exists:
            return None
        self.cur.execute(
            "INSERT INTO chat_messages (session_id, sender, body) VALUES (?, ?, ?)",
            (session_id, sender, text[:4000]),
        )
        self.conn.commit()
        return self.find_by_id(int(self.cur.lastrowid))

    def delete(self, message_id: int) -> None:
        self.cur.execute("DELETE FROM chat_messages WHERE id = ?", (message_id,))
        self.conn.commit()
