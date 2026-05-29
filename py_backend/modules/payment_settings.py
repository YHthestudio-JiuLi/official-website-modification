from __future__ import annotations

import sqlite3
from typing import Any, Dict, Optional

from ..utils import row_to_dict, now_iso


class PaymentSettingsManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_settings (
              id INT AUTO_INCREMENT PRIMARY KEY,
              wallet_address VARCHAR(255) NOT NULL,
              network VARCHAR(32) DEFAULT 'TRC20',
              autoDeleteMinutes INT DEFAULT 30,
              updatedAt VARCHAR(40)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def get(self) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1")
        return row_to_dict(self.cur.fetchone())

    def update(
        self,
        wallet_address: str,
        network: str = "TRC20",
        auto_delete_minutes: int = 30,
    ) -> Optional[int]:
        updated = now_iso()
        self.cur.execute("SELECT COUNT(*) AS count FROM payment_settings")
        cnt = int(self.cur.fetchone()["count"])
        if cnt == 0:
            self.cur.execute(
                "INSERT INTO payment_settings (wallet_address, network, autoDeleteMinutes, updatedAt) VALUES (?, ?, ?, ?)",
                (wallet_address, network, auto_delete_minutes, updated),
            )
            self.conn.commit()
            return int(self.cur.lastrowid)
        self.cur.execute(
            """
            UPDATE payment_settings
            SET wallet_address = ?, network = ?, autoDeleteMinutes = ?, updatedAt = ?
            WHERE id = (SELECT id FROM (SELECT id FROM payment_settings ORDER BY id DESC LIMIT 1) t)
            """,
            (wallet_address, network, auto_delete_minutes, updated),
        )
        self.conn.commit()
        return None

    def seed_default(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS count FROM payment_settings")
        if (self.cur.fetchone()["count"] or 0) == 0:
            self.cur.execute(
                "INSERT INTO payment_settings (wallet_address, network, autoDeleteMinutes) VALUES (?, ?, ?)",
                ("TXYZabcdefghijklmnopqrstuvwxyz123456", "TRC20", 30),
            )
            self.conn.commit()
