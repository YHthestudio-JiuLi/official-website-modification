from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class ChatAdminManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_admins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL,
              display_name TEXT NOT NULL,
              bio TEXT DEFAULT '',
              avatar_color TEXT DEFAULT '#07c160',
              telegram_chat_id TEXT,
              telegram_token TEXT,
              chatbot_enabled INTEGER DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        for col, default in [
            ("telegram_chat_id", None),
            ("telegram_token", None),
            ("chatbot_enabled", "0"),
        ]:
            try:
                if default is None:
                    self.conn.execute(f"ALTER TABLE chat_admins ADD COLUMN {col} TEXT")
                else:
                    self.conn.execute(f"ALTER TABLE chat_admins ADD COLUMN {col} INTEGER DEFAULT {default}")
            except Exception:
                pass

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            "SELECT id, username, display_name, bio, avatar_color, telegram_chat_id, telegram_token, chatbot_enabled, created_at FROM chat_admins ORDER BY id ASC"
        )
        return [dict(row) for row in self.cur.fetchall()]

    def find_by_id(self, admin_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT id, username, display_name, bio, avatar_color, telegram_chat_id, telegram_token, chatbot_enabled, created_at FROM chat_admins WHERE id = ?",
            (admin_id,),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def create(
        self,
        username: str,
        display_name: str,
        bio: str = "",
        avatar_color: str = "#07c160",
    ) -> int:
        self.cur.execute(
            "INSERT INTO chat_admins (username, display_name, bio, avatar_color) VALUES (?, ?, ?, ?)",
            (username, display_name, bio, avatar_color),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(
        self,
        admin_id: int,
        display_name: str,
        bio: str,
        avatar_color: str,
        telegram_chat_id: str = None,
        telegram_token: str = None,
        chatbot_enabled: bool = False,
    ) -> None:
        self.cur.execute(
            "UPDATE chat_admins SET display_name = ?, bio = ?, avatar_color = ?, telegram_chat_id = ?, telegram_token = ?, chatbot_enabled = ? WHERE id = ?",
            (display_name, bio, avatar_color, telegram_chat_id, telegram_token, 1 if chatbot_enabled else 0, admin_id),
        )
        self.conn.commit()

    def update_chatbot_enabled(self, admin_id: int, enabled: bool) -> None:
        self.cur.execute(
            "UPDATE chat_admins SET chatbot_enabled = ? WHERE id = ?",
            (1 if enabled else 0, admin_id),
        )
        self.conn.commit()

    def delete(self, admin_id: int) -> None:
        self.cur.execute("DELETE FROM chat_admins WHERE id = ?", (admin_id,))
        self.conn.commit()

    def init_default_admins(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS c FROM chat_admins")
        count = self.cur.fetchone()["c"]
        if count == 0:
            self.create("support", "官方客服", "网站管理员 · 在线为您解答", "#07c160")
            self.create("sales", "售前咨询", "产品与服务咨询", "#10aeff")
