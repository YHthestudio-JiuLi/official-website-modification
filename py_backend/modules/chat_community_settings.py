from __future__ import annotations

import sqlite3
from typing import Any, Dict, Optional

from ..utils import row_to_dict, now_iso


class ChatCommunitySettingsManager:
    """客服页展示的 Telegram / QQ 交流群链接（单行配置）"""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_community_settings (
              id INT AUTO_INCREMENT PRIMARY KEY,
              telegramGroupUrl VARCHAR(512),
              qqGroupUrl VARCHAR(512),
              updatedAt VARCHAR(40)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def get(self) -> Dict[str, Any]:
        self.cur.execute("SELECT * FROM chat_community_settings ORDER BY id DESC LIMIT 1")
        row = row_to_dict(self.cur.fetchone())
        if not row:
            return {"telegramGroupUrl": "", "qqGroupUrl": ""}
        return {
            "telegramGroupUrl": row.get("telegramGroupUrl") or "",
            "qqGroupUrl": row.get("qqGroupUrl") or "",
            "updatedAt": row.get("updatedAt"),
        }

    def update(self, telegram_group_url: str = "", qq_group_url: str = "") -> None:
        tg = (telegram_group_url or "").strip()
        qq = (qq_group_url or "").strip()
        updated = now_iso()
        self.cur.execute("SELECT COUNT(*) AS c FROM chat_community_settings")
        if (self.cur.fetchone()["c"] or 0) == 0:
            self.cur.execute(
                "INSERT INTO chat_community_settings (telegramGroupUrl, qqGroupUrl, updatedAt) VALUES (?, ?, ?)",
                (tg or None, qq or None, updated),
            )
        else:
            self.cur.execute(
                """
                UPDATE chat_community_settings
                SET telegramGroupUrl = ?, qqGroupUrl = ?, updatedAt = ?
                WHERE id = (SELECT id FROM (SELECT id FROM chat_community_settings ORDER BY id DESC LIMIT 1) t)
                """,
                (tg or None, qq or None, updated),
            )
        self.conn.commit()
