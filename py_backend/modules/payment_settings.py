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
              txVerifyMaxUnderpayUsdt DECIMAL(10,2) DEFAULT 5,
              txVerifyMaxAgeHours INT DEFAULT 2,
              updatedAt VARCHAR(40)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        self._ensure_tx_verify_columns()

    def _ensure_tx_verify_columns(self) -> None:
        """兼容旧表：补链上验单规则字段"""
        columns = {
            "txVerifyMaxUnderpayUsdt": "DECIMAL(10,2) DEFAULT 5",
            "txVerifyMaxAgeHours": "INT DEFAULT 2",
        }
        for name, ddl in columns.items():
            try:
                self.cur.execute(f"SELECT {name} FROM payment_settings LIMIT 1")
            except Exception:
                try:
                    self.conn.execute(f"ALTER TABLE payment_settings ADD COLUMN {name} {ddl}")
                except Exception:
                    pass

    def get(self) -> Optional[Dict[str, Any]]:
        self._ensure_tx_verify_columns()
        self.cur.execute("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1")
        row = row_to_dict(self.cur.fetchone())
        if not row:
            return None
        if row.get("txVerifyMaxUnderpayUsdt") is None:
            row["txVerifyMaxUnderpayUsdt"] = 5
        if row.get("txVerifyMaxAgeHours") is None:
            row["txVerifyMaxAgeHours"] = 2
        return row

    def update(
        self,
        wallet_address: str,
        network: str = "TRC20",
        auto_delete_minutes: int = 30,
        tx_verify_max_underpay_usdt: float = 5.0,
        tx_verify_max_age_hours: int = 2,
    ) -> Optional[int]:
        self._ensure_tx_verify_columns()
        updated = now_iso()
        underpay = max(0.0, float(tx_verify_max_underpay_usdt))
        max_age = max(0, int(tx_verify_max_age_hours))
        self.cur.execute("SELECT COUNT(*) AS count FROM payment_settings")
        cnt = int(self.cur.fetchone()["count"])
        if cnt == 0:
            self.cur.execute(
                """
                INSERT INTO payment_settings
                (wallet_address, network, autoDeleteMinutes, txVerifyMaxUnderpayUsdt, txVerifyMaxAgeHours, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (wallet_address, network, auto_delete_minutes, underpay, max_age, updated),
            )
            self.conn.commit()
            return int(self.cur.lastrowid)
        self.cur.execute(
            """
            UPDATE payment_settings
            SET wallet_address = ?, network = ?, autoDeleteMinutes = ?,
                txVerifyMaxUnderpayUsdt = ?, txVerifyMaxAgeHours = ?, updatedAt = ?
            WHERE id = (SELECT id FROM (SELECT id FROM payment_settings ORDER BY id DESC LIMIT 1) t)
            """,
            (wallet_address, network, auto_delete_minutes, underpay, max_age, updated),
        )
        self.conn.commit()
        return None

    def seed_default(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS count FROM payment_settings")
        if (self.cur.fetchone()["count"] or 0) == 0:
            self.cur.execute(
                """
                INSERT INTO payment_settings
                (wallet_address, network, autoDeleteMinutes, txVerifyMaxUnderpayUsdt, txVerifyMaxAgeHours)
                VALUES (?, ?, ?, ?, ?)
                """,
                ("TXYZabcdefghijklmnopqrstuvwxyz123456", "TRC20", 30, 5, 2),
            )
            self.conn.commit()
