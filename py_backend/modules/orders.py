from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict, now_iso


class OrderManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              userId INTEGER NOT NULL,
              username TEXT NOT NULL,
              productId INTEGER NOT NULL,
              productName TEXT NOT NULL,
              quantity INTEGER DEFAULT 1,
              price REAL NOT NULL,
              totalAmount REAL NOT NULL,
              status TEXT DEFAULT 'pending',
              paymentMethod TEXT DEFAULT 'USDT',
              usdtWallet TEXT,
              network TEXT DEFAULT 'TRC20',
              txHash TEXT,
              shippingAddress TEXT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              paidAt DATETIME,
              completedAt DATETIME,
              FOREIGN KEY (userId) REFERENCES users(id),
              FOREIGN KEY (productId) REFERENCES products(id)
            )
            """
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_productId ON orders(productId)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt)")

    def find_all(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        if status_filter:
            self.cur.execute(
                "SELECT * FROM orders WHERE status = ? ORDER BY createdAt DESC",
                (status_filter,),
            )
        else:
            self.cur.execute("SELECT * FROM orders ORDER BY createdAt DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, order_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
        return row_to_dict(self.cur.fetchone())

    def find_by_user_id(self, user_id: int) -> List[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC",
            (user_id,),
        )
        return rows_to_dict(self.cur.fetchall())

    def create(self, order_data: Dict[str, Any]) -> int:
        created_at = now_iso()
        self.cur.execute(
            """
            INSERT INTO orders (
              userId, username, productId, productName, quantity, price, totalAmount,
              status, paymentMethod, usdtWallet, network, shippingAddress, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_data["userId"],
                order_data["username"],
                order_data["productId"],
                order_data["productName"],
                order_data.get("quantity", 1),
                order_data["price"],
                order_data["totalAmount"],
                order_data.get("status", "pending"),
                order_data.get("paymentMethod", "USDT"),
                order_data.get("usdtWallet"),
                order_data.get("network", "TRC20"),
                order_data.get("shippingAddress"),
                created_at,
            ),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update_status(self, order_id: int, status: str) -> None:
        sql = "UPDATE orders SET status = ?"
        params: List[Any] = [status]
        if status == "paid":
            paid_at = now_iso()
            sql += ", paidAt = ?"
            params.append(paid_at)
        if status == "completed":
            completed_at = now_iso()
            sql += ", completedAt = ?"
            params.append(completed_at)
        sql += " WHERE id = ?"
        params.append(order_id)
        self.cur.execute(sql, params)
        self.conn.commit()

    def update_tx_hash(self, order_id: int, tx_hash: str) -> None:
        self.cur.execute(
            "UPDATE orders SET txHash = ?, paidAt = ? WHERE id = ?",
            (tx_hash, now_iso(), order_id),
        )
        self.conn.commit()

    def update_shipping_address(self, order_id: int, shipping_address: str) -> None:
        self.cur.execute(
            "UPDATE orders SET shippingAddress = ? WHERE id = ?",
            (shipping_address, order_id),
        )
        self.conn.commit()

    def get_stats(self) -> Dict[str, Any]:
        self.cur.execute("SELECT COUNT(*) AS total FROM orders")
        total = int(self.cur.fetchone()["total"])
        self.cur.execute("SELECT COUNT(*) AS pending FROM orders WHERE status = 'pending'")
        pending = int(self.cur.fetchone()["pending"])
        self.cur.execute(
            "SELECT COALESCE(SUM(totalAmount), 0) AS revenue FROM orders WHERE status IN ('paid','completed')"
        )
        revenue = self.cur.fetchone()["revenue"] or 0
        return {"total": total, "pending": pending, "revenue": revenue}

    def delete(self, order_id: int) -> None:
        self.cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        self.conn.commit()

    def delete_expired_pending(self, minutes: int) -> int:
        self.cur.execute(
            """
            DELETE FROM orders
            WHERE status = 'pending'
            AND datetime(replace(replace(createdAt,'T',' '),'Z',''), '+' || ? || ' minutes') < datetime('now')
            """,
            (minutes,),
        )
        self.conn.commit()
        return int(self.cur.rowcount if self.cur.rowcount is not None else 0)
