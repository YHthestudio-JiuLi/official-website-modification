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
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM popup_notices ORDER BY updated_at DESC, id DESC")
        return [dict(row) for row in self.cur.fetchall()]

    def find_by_id(self, notice_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM popup_notices WHERE id = ?",
            (notice_id,),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def find_active(self) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM popup_notices WHERE enabled = 1 ORDER BY updated_at DESC, id DESC LIMIT 1",
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def create(self, title: str, content: str, enabled: bool = True) -> Optional[Dict[str, Any]]:
        if not title.strip() or not content.strip():
            return None
        if enabled:
            # 保证同一时刻只有一个启用弹窗，避免前台显示与后台预期不一致
            self.cur.execute("UPDATE popup_notices SET enabled = 0, updated_at = datetime('now') WHERE enabled = 1")
        self.cur.execute(
            "INSERT INTO popup_notices (title, content, enabled) VALUES (?, ?, ?)",
            (title.strip(), content.strip(), 1 if enabled else 0),
        )
        self.conn.commit()
        return self.find_by_id(int(self.cur.lastrowid))

    def update(self, notice_id: int, title: str, content: str, enabled: bool) -> Optional[Dict[str, Any]]:
        if not title.strip() or not content.strip():
            return None
        existing = self.find_by_id(int(notice_id))
        if not existing:
            return None
        if enabled:
            self.cur.execute(
                "UPDATE popup_notices SET enabled = 0, updated_at = datetime('now') WHERE enabled = 1 AND id != ?",
                (int(notice_id),),
            )
        self.cur.execute(
            "UPDATE popup_notices SET title = ?, content = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
            (title.strip(), content.strip(), 1 if enabled else 0, int(notice_id)),
        )
        self.conn.commit()
        return self.find_by_id(int(notice_id))

    def delete(self, notice_id: int) -> bool:
        self.cur.execute("DELETE FROM popup_notices WHERE id = ?", (int(notice_id),))
        self.conn.commit()
        return bool(self.cur.rowcount and self.cur.rowcount > 0)
