from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict, now_iso


def _parse_order_created_at(raw: str) -> Optional[datetime]:
    """将订单 createdAt 字符串解析为 UTC 时间；无法解析时返回 None。"""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    elif "T" not in s and len(s) >= 19 and s[4] == "-" and s[7] == "-":
        # SQLite 常见 'YYYY-MM-DD HH:MM:SS' 形式
        s = f"{s[:10]}T{s[11:]}"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


class OrderManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
              id INT AUTO_INCREMENT PRIMARY KEY,
              userId INT NOT NULL,
              username VARCHAR(255) NOT NULL,
              productId INT NOT NULL,
              productName VARCHAR(512) NOT NULL,
              quantity INT DEFAULT 1,
              price DOUBLE NOT NULL,
              totalAmount DOUBLE NOT NULL,
              status VARCHAR(32) DEFAULT 'pending',
              paymentMethod VARCHAR(32) DEFAULT 'USDT',
              usdtWallet VARCHAR(255),
              network VARCHAR(32) DEFAULT 'TRC20',
              txHash VARCHAR(255),
              shippingAddress TEXT,
              createdAt VARCHAR(40),
              paidAt VARCHAR(40),
              completedAt VARCHAR(40),
              KEY idx_orders_userId (userId),
              KEY idx_orders_status (status),
              KEY idx_orders_productId (productId),
              KEY idx_orders_createdAt (createdAt)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        if status_filter:
            self.cur.execute(
                "SELECT * FROM orders WHERE status = ? ORDER BY createdAt DESC",
                (status_filter,),
            )
        else:
            self.cur.execute("SELECT * FROM orders ORDER BY createdAt DESC")
        return rows_to_dict(self.cur.fetchall())

    _ORDER_DETAIL_SELECT = """
        SELECT o.*,
               c.name AS categoryName,
               sc.name AS subCategoryName
        FROM orders o
        LEFT JOIN products p ON o.productId = p.id
        LEFT JOIN product_categories c ON p.categoryId = c.id
        LEFT JOIN product_categories sc ON p.subCategoryId = sc.id
    """

    def find_by_id(self, order_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(f"{self._ORDER_DETAIL_SELECT} WHERE o.id = ?", (order_id,))
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
        # 不用 SQLite datetime() 拼字符串：ISO 含微秒/Z 时易解析失败导致永远不删
        try:
            minutes_val = int(minutes)
        except (TypeError, ValueError):
            minutes_val = 30
        minutes_val = max(1, min(minutes_val, 525600))
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes_val)
        self.cur.execute(
            "SELECT id, createdAt FROM orders WHERE status = 'pending'"
        )
        to_delete: List[int] = []
        for row in self.cur.fetchall():
            rid = row["id"]
            ca = row["createdAt"]
            if ca is None:
                continue
            parsed = _parse_order_created_at(str(ca))
            if parsed is not None and parsed < cutoff:
                to_delete.append(int(rid))
        if not to_delete:
            return 0
        placeholders = ",".join(["?"] * len(to_delete))
        self.cur.execute(
            f"DELETE FROM orders WHERE id IN ({placeholders})",
            to_delete,
        )
        self.conn.commit()
        return int(self.cur.rowcount if self.cur.rowcount is not None else 0)
