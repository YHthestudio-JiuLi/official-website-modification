from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict


class ForumReplyManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS forum_replies (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId INTEGER NOT NULL,
              author TEXT NOT NULL,
              content TEXT NOT NULL,
              parentReplyId INTEGER,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (postId) REFERENCES forum_posts(id) ON DELETE CASCADE,
              FOREIGN KEY (parentReplyId) REFERENCES forum_replies(id) ON DELETE CASCADE
            )
            """
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_forum_replies_postId ON forum_replies(postId)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_forum_replies_createdAt ON forum_replies(createdAt)")

    def find_by_post_id(self, post_id: int) -> List[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM forum_replies WHERE postId = ? ORDER BY createdAt ASC",
            (post_id,),
        )
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, reply_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM forum_replies WHERE id = ?", (reply_id,))
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        post_id: int,
        author: str,
        content: str,
        parent_reply_id: Optional[int] = None,
    ) -> int:
        """
        创建论坛回复
        
        在事务中执行：
        1. 插入回复记录
        2. 增加帖子回复计数
        
        返回新创建的回复 ID
        """
        with self.conn:
            self.cur.execute(
                "INSERT INTO forum_replies (postId, author, content, parentReplyId) VALUES (?, ?, ?, ?)",
                (post_id, author, content, parent_reply_id),
            )
            reply_id = int(self.cur.lastrowid)
            self.cur.execute("UPDATE forum_posts SET replies = replies + 1 WHERE id = ?", (post_id,))
        return reply_id

    def delete(self, reply_id: int) -> bool:
        """删除论坛回复，并同步帖子回复计数。"""
        self.cur.execute("SELECT postId FROM forum_replies WHERE id = ?", (reply_id,))
        row = self.cur.fetchone()
        if not row:
            return False
        post_id = int(row["postId"])
        with self.conn:
            self.cur.execute("DELETE FROM forum_replies WHERE id = ?", (reply_id,))
            self.cur.execute(
                "UPDATE forum_posts SET replies = (SELECT COUNT(*) FROM forum_replies WHERE postId = ?) WHERE id = ?",
                (post_id, post_id),
            )
        return True
