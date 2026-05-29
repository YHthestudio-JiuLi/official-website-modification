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
              id INT AUTO_INCREMENT PRIMARY KEY,
              postId INT NOT NULL,
              author VARCHAR(255) NOT NULL,
              content TEXT NOT NULL,
              parentReplyId INT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_forum_replies_postId (postId),
              KEY idx_forum_replies_createdAt (createdAt),
              CONSTRAINT fk_reply_post FOREIGN KEY (postId) REFERENCES forum_posts(id) ON DELETE CASCADE,
              CONSTRAINT fk_reply_parent FOREIGN KEY (parentReplyId) REFERENCES forum_replies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

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
