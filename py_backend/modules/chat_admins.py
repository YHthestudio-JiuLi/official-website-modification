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
              id INT AUTO_INCREMENT PRIMARY KEY,
              username VARCHAR(255) UNIQUE NOT NULL,
              display_name VARCHAR(255) NOT NULL,
              bio TEXT,
              avatar_color VARCHAR(32) DEFAULT '#07c160',
              telegram_chat_id VARCHAR(255),
              telegram_token VARCHAR(255),
              chatbot_enabled TINYINT DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def ensure_support_admin(self) -> None:
        """确保存在 username=support 的客服（后台聊天设置依赖此项）"""
        self.cur.execute("SELECT id FROM chat_admins WHERE username = ?", ("support",))
        if not self.cur.fetchone():
            self.create("support", "官方客服", "网站管理员 · 在线为您解答", "#07c160")

    def find_all(self) -> List[Dict[str, Any]]:
        self.ensure_support_admin()
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
            return
        self.ensure_support_admin()
