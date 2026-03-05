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
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              message TEXT NOT NULL,
              read INTEGER DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_contact_messages_read ON contact_messages(read)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_contact_messages_createdAt ON contact_messages(createdAt)")
