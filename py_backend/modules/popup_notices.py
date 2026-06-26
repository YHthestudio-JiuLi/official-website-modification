from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class PopupNoticeManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS popup_notices (
              id INT AUTO_INCREMENT PRIMARY KEY,
              title VARCHAR(512) NOT NULL,
              content TEXT NOT NULL,
              enabled TINYINT NOT NULL DEFAULT 1,
              popup_enabled TINYINT NOT NULL DEFAULT 1,
              display_enabled TINYINT NOT NULL DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        self._ensure_scope_columns()

    def _ensure_scope_columns(self) -> None:
        """已有库升级：拆分首页弹窗与页面展示开关"""
        from ..db import add_column_if_missing, column_exists

        popup_was_missing = not column_exists(self.conn, "popup_notices", "popup_enabled")
        display_was_missing = not column_exists(self.conn, "popup_notices", "display_enabled")
        add_column_if_missing(self.conn, "popup_notices", "popup_enabled", "TINYINT NOT NULL DEFAULT 1")
        add_column_if_missing(self.conn, "popup_notices", "display_enabled", "TINYINT NOT NULL DEFAULT 1")
        if popup_was_missing or display_was_missing:
            self.cur.execute(
                "UPDATE popup_notices SET popup_enabled = enabled, display_enabled = enabled"
            )
            self.conn.commit()

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM popup_notices ORDER BY updated_at DESC, id DESC")
        return [self._normalize_row(dict(row)) for row in self.cur.fetchall()]

    def find_by_id(self, notice_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM popup_notices WHERE id = ?",
            (notice_id,),
        )
        row = self.cur.fetchone()
        return self._normalize_row(dict(row)) if row else None

    def _normalize_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        popup = bool(row.get("popup_enabled", row.get("enabled", 0)))
        display = bool(row.get("display_enabled", row.get("enabled", 0)))
        row["popup_enabled"] = popup
        row["display_enabled"] = display
        row["enabled"] = popup or display
        return row

    def find_active(self) -> Optional[Dict[str, Any]]:
        """兼容旧 RPC：等同首页弹窗公告"""
        return self.find_active_popup()

    def find_active_popup(self) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT * FROM popup_notices
            WHERE popup_enabled = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        )
        row = self.cur.fetchone()
        return self._normalize_row(dict(row)) if row else None

    def find_active_display(self) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT * FROM popup_notices
            WHERE display_enabled = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """
        )
        row = self.cur.fetchone()
        return self._normalize_row(dict(row)) if row else None

    def create(
        self,
        title: str,
        content: str,
        popup_enabled: bool = True,
        display_enabled: bool = True,
    ) -> Optional[Dict[str, Any]]:
        if not title.strip() or not content.strip():
            return None
        if popup_enabled:
            self.cur.execute(
                "UPDATE popup_notices SET popup_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE popup_enabled = 1"
            )
        if display_enabled:
            self.cur.execute(
                "UPDATE popup_notices SET display_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE display_enabled = 1"
            )
        merged_enabled = 1 if (popup_enabled or display_enabled) else 0
        self.cur.execute(
            """
            INSERT INTO popup_notices (title, content, enabled, popup_enabled, display_enabled)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                title.strip(),
                content.strip(),
                merged_enabled,
                1 if popup_enabled else 0,
                1 if display_enabled else 0,
            ),
        )
        self.conn.commit()
        return self.find_by_id(int(self.cur.lastrowid))

    def update(
        self,
        notice_id: int,
        title: str,
        content: str,
        popup_enabled: bool,
        display_enabled: bool,
    ) -> Optional[Dict[str, Any]]:
        if not title.strip() or not content.strip():
            return None
        existing = self.find_by_id(int(notice_id))
        if not existing:
            return None
        if popup_enabled:
            self.cur.execute(
                """
                UPDATE popup_notices
                SET popup_enabled = 0, updated_at = CURRENT_TIMESTAMP
                WHERE popup_enabled = 1 AND id != ?
                """,
                (int(notice_id),),
            )
        if display_enabled:
            self.cur.execute(
                """
                UPDATE popup_notices
                SET display_enabled = 0, updated_at = CURRENT_TIMESTAMP
                WHERE display_enabled = 1 AND id != ?
                """,
                (int(notice_id),),
            )
        merged_enabled = 1 if (popup_enabled or display_enabled) else 0
        self.cur.execute(
            """
            UPDATE popup_notices
            SET title = ?, content = ?, enabled = ?, popup_enabled = ?, display_enabled = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                title.strip(),
                content.strip(),
                merged_enabled,
                1 if popup_enabled else 0,
                1 if display_enabled else 0,
                int(notice_id),
            ),
        )
        self.conn.commit()
        return self.find_by_id(int(notice_id))

    def delete(self, notice_id: int) -> bool:
        self.cur.execute("DELETE FROM popup_notices WHERE id = ?", (int(notice_id),))
        self.conn.commit()
        return bool(self.cur.rowcount and self.cur.rowcount > 0)
