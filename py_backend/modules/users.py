from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import DEFAULT_ADMIN_BCRYPT_HASH, row_to_dict, rows_to_dict


class UserManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              username VARCHAR(255) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              password TEXT NOT NULL,
              isAdmin TINYINT DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_users_username (username),
              KEY idx_users_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users ORDER BY createdAt DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return row_to_dict(self.cur.fetchone())

    def find_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE username = ?", (username,))
        return row_to_dict(self.cur.fetchone())

    def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE email = ?", (email,))
        return row_to_dict(self.cur.fetchone())

    def create(self, username: str, email: str, password: str, is_admin: int = 0) -> int:
        self.cur.execute(
            "INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)",
            (username, email, password, is_admin),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(self, user_id: int, email: str, password: Optional[str], is_admin: int) -> None:
        if password:
            self.cur.execute(
                "UPDATE users SET email = ?, password = ?, isAdmin = ? WHERE id = ?",
                (email, password, is_admin, user_id),
            )
        else:
            self.cur.execute(
                "UPDATE users SET email = ?, isAdmin = ? WHERE id = ?",
                (email, is_admin, user_id),
            )
        self.conn.commit()

    def delete(self, user_id: int) -> None:
        self.cur.execute("DELETE FROM users WHERE id = ? AND isAdmin = 0", (user_id,))
        self.conn.commit()

    def seed_default_admin(self) -> None:
        self.cur.execute("SELECT id FROM users WHERE username = ?", ("admin",))
        if self.cur.fetchone() is None:
            self.cur.execute(
                "INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)",
                ("admin", "admin@yhthestudio.com", DEFAULT_ADMIN_BCRYPT_HASH, 1),
            )
            self.conn.commit()
