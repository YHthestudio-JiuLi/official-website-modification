from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class ChatTgLinkManager:
    """Manages links between Telegram messages and chat sessions."""
    
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_tg_links (
              chat_id INTEGER NOT NULL,
              tg_message_id INTEGER NOT NULL,
              session_id TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY (chat_id, tg_message_id)
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_tg_session ON chat_tg_links(session_id)"
        )
        try:
            self.conn.execute("ALTER TABLE chat_tg_links ADD COLUMN chat_message_id INTEGER")
        except Exception:
            pass
        try:
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_tg_chat_message ON chat_tg_links(chat_message_id)")
        except Exception:
            pass
        
        # Migration: rename old column if exists
        try:
            cur = self.conn.cursor()
            cur.execute("PRAGMA table_info(chat_tg_links)")
            cols = [row[1] for row in cur.fetchall()]
            if "message_id" in cols and "tg_message_id" not in cols:
                # Recreate table with correct column name
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS chat_tg_links_new (
                      chat_id INTEGER NOT NULL,
                      tg_message_id INTEGER NOT NULL,
                      session_id TEXT NOT NULL,
                      chat_message_id INTEGER,
                      created_at TEXT NOT NULL DEFAULT (datetime('now')),
                      PRIMARY KEY (chat_id, tg_message_id)
                    )
                """)
                cur.execute("""
                    INSERT OR IGNORE INTO chat_tg_links_new (chat_id, tg_message_id, session_id, chat_message_id, created_at)
                    SELECT chat_id, message_id, session_id, chat_message_id, created_at FROM chat_tg_links
                """)
                cur.execute("DROP TABLE chat_tg_links")
                cur.execute("ALTER TABLE chat_tg_links_new RENAME TO chat_tg_links")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_tg_session ON chat_tg_links(session_id)")
                self.conn.commit()
                print("[Migration] Renamed message_id to tg_message_id in chat_tg_links")
        except Exception as e:
            print(f"[Migration] Skip rename: {e}")

    def create(self, chat_id: int, tg_message_id: int, session_id: str, chat_message_id: int = None) -> None:
        self.cur.execute(
            "INSERT OR REPLACE INTO chat_tg_links (chat_id, tg_message_id, session_id, chat_message_id) VALUES (?, ?, ?, ?)",
            (chat_id, tg_message_id, session_id, chat_message_id),
        )
        self.conn.commit()

    def find_by_tg_message(self, chat_id: int, tg_message_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT chat_id, tg_message_id, session_id, chat_message_id, created_at FROM chat_tg_links WHERE chat_id = ? AND tg_message_id = ?",
            (chat_id, tg_message_id),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def find_by_session_and_chat_message(self, session_id: str, chat_message_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT chat_id, tg_message_id, session_id, chat_message_id, created_at FROM chat_tg_links WHERE session_id = ? AND chat_message_id = ?",
            (session_id, chat_message_id),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def find_latest_user_tg_message(self, session_id: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT l.chat_id, l.tg_message_id, l.session_id, l.chat_message_id, l.created_at
            FROM chat_tg_links l
            INNER JOIN chat_messages m ON l.chat_message_id = m.id
            WHERE l.session_id = ? AND m.sender = 'user'
            ORDER BY m.id DESC
            LIMIT 1
            """,
            (session_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def find_by_session(self, session_id: str) -> List[Dict[str, Any]]:
        self.cur.execute(
            "SELECT chat_id, tg_message_id, session_id, chat_message_id, created_at FROM chat_tg_links WHERE session_id = ?",
            (session_id,),
        )
        rows = self.cur.fetchall()
        return [dict(row) for row in rows] if rows else []

    def delete_by_session(self, session_id: str) -> None:
        self.cur.execute("DELETE FROM chat_tg_links WHERE session_id = ?", (session_id,))
        self.conn.commit()