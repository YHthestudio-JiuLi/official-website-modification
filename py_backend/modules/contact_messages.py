from __future__ import annotations

import sqlite3
from typing import Any, Dict, Optional

from ..utils import row_to_dict, rows_to_dict


class ContactMessageManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contact_messages (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL,
              message TEXT NOT NULL,
              `read` TINYINT DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_contact_messages_read (`read`),
              KEY idx_contact_messages_createdAt (createdAt)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
