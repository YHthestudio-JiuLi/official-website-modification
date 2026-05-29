from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict


class ForumPostManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS forum_posts (
              id INT AUTO_INCREMENT PRIMARY KEY,
              title VARCHAR(512) NOT NULL,
              author VARCHAR(255) NOT NULL,
              content TEXT NOT NULL,
              date VARCHAR(64),
              replies INT DEFAULT 0,
              isPinned TINYINT DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_forum_posts_createdAt (createdAt),
              KEY idx_forum_posts_isPinned (isPinned)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM forum_posts ORDER BY isPinned DESC, date DESC, id DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, post_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM forum_posts WHERE id = ?", (post_id,))
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        title: str,
        author: str,
        content: str,
        date: Optional[str],
        replies: int = 0,
    ) -> int:
        self.cur.execute(
            "INSERT INTO forum_posts (title, author, content, date, replies, isPinned) VALUES (?, ?, ?, ?, ?, 0)",
            (title, author, content, date, replies),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(
        self,
        post_id: int,
        title: str,
        author: str,
        content: str,
        date: Optional[str],
        replies: int,
    ) -> None:
        self.cur.execute(
            "UPDATE forum_posts SET title = ?, author = ?, content = ?, date = ?, replies = ? WHERE id = ?",
            (title, author, content, date, replies, post_id),
        )
        self.conn.commit()

    def toggle_pin(self, post_id: int) -> int:
        self.cur.execute("SELECT isPinned FROM forum_posts WHERE id = ?", (post_id,))
        row = self.cur.fetchone()
        if row is None:
            raise ValueError("帖子不存在")
        new_status = 0 if int(row["isPinned"] or 0) == 1 else 1
        self.cur.execute("UPDATE forum_posts SET isPinned = ? WHERE id = ?", (new_status, post_id))
        self.conn.commit()
        return int(new_status)

    def delete(self, post_id: int) -> None:
        self.cur.execute("DELETE FROM forum_posts WHERE id = ?", (post_id,))
        self.conn.commit()

    def increment_replies(self, post_id: int) -> None:
        self.cur.execute("UPDATE forum_posts SET replies = replies + 1 WHERE id = ?", (post_id,))
        self.conn.commit()

    def seed_sample_data(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS count FROM forum_posts")
        if (self.cur.fetchone()["count"] or 0) == 0:
            posts = [
                (
                    "欢迎来到 YHthestudio 论坛",
                    "Admin",
                    "这里是技术交流的天地，欢迎大家分享经验和想法！",
                    "2024-01-10",
                    5,
                ),
                ("最新产品发布讨论", "TechLead", "关于我们最新 AI 产品的技术细节讨论", "2024-01-12", 12),
                ("前端开发最佳实践", "DevUser", "分享一些前端开发的经验和技巧", "2024-01-15", 8),
            ]
            self.cur.executemany(
                "INSERT INTO forum_posts (title, author, content, date, replies) VALUES (?, ?, ?, ?, ?)",
                posts,
            )
            self.conn.commit()
