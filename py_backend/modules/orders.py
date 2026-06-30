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
              orderNo VARCHAR(8) UNIQUE,
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
              trackingNumber VARCHAR(64),
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
        self._ensure_tracking_number_column()
        self._ensure_order_no_column()
        self._ensure_config_columns()
        self._ensure_shipped_at_column()

    def _ensure_order_no_column(self) -> None:
        """已有库升级：8 位业务订单号"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "orders", "orderNo", "VARCHAR(8) UNIQUE")

    def _ensure_tracking_number_column(self) -> None:
        """已有库升级：物流快递单号"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "orders", "trackingNumber", "VARCHAR(64)")

    def _ensure_config_columns(self) -> None:
        """已有库升级：下单所选商品配置快照"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "orders", "configId", "VARCHAR(64)")
        add_column_if_missing(self.conn, "orders", "configName", "VARCHAR(255)")

    def _ensure_shipped_at_column(self) -> None:
        """已有库升级：发货时间"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "orders", "shippedAt", "VARCHAR(40)")

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

    def _resolve_product_category_meta(self, product_id: int) -> Dict[str, Any]:
        """下单时读取商品一二级分类，用于生成订单号"""
        self.cur.execute(
            """
            SELECT c.slug AS categorySlug, sc.slug AS subCategorySlug,
                   c.name AS categoryName, sc.name AS subCategoryName
            FROM products p
            LEFT JOIN product_categories c ON p.categoryId = c.id
            LEFT JOIN product_categories sc ON p.subCategoryId = sc.id
            WHERE p.id = ?
            """,
            (product_id,),
        )
        return row_to_dict(self.cur.fetchone()) or {}

    def _generate_unique_order_no(self, product_id: int) -> str:
        from ..order_no import build_order_no

        meta = self._resolve_product_category_meta(product_id)
        for _ in range(20):
            order_no = build_order_no(
                meta.get("categorySlug"),
                meta.get("subCategorySlug"),
                meta.get("categoryName"),
                meta.get("subCategoryName"),
            )
            self.cur.execute("SELECT id FROM orders WHERE orderNo = ? LIMIT 1", (order_no,))
            if not self.cur.fetchone():
                return order_no
        raise RuntimeError("Failed to generate unique order number")

    def create(self, order_data: Dict[str, Any]) -> int:
        created_at = now_iso()
        product_id = int(order_data["productId"])
        order_no = self._generate_unique_order_no(product_id)
        self.cur.execute(
            """
            INSERT INTO orders (
              orderNo, userId, username, productId, productName, quantity, price, totalAmount,
              status, paymentMethod, usdtWallet, network, shippingAddress, createdAt,
              configId, configName
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_no,
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
                order_data.get("configId"),
                order_data.get("configName"),
            ),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update_status(self, order_id: int, status: str) -> None:
        # 业务规则以 Laravel V2 为准；此处仅保留 legacy RPC 兼容
        if status == "completed":
            status = "delivered"
        if status not in ("pending", "paid", "shipped", "delivered"):
            raise ValueError(f"Invalid order status: {status}")
        sql = "UPDATE orders SET status = ?"
        params: List[Any] = [status]
        if status == "paid":
            paid_at = now_iso()
            sql += ", paidAt = ?"
            params.append(paid_at)
        if status == "shipped":
            shipped_at = now_iso()
            sql += ", shippedAt = ?"
            params.append(shipped_at)
        if status == "delivered":
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

    def update_tracking_number(self, order_id: int, tracking_number: Optional[str]) -> None:
        value = (tracking_number or "").strip() or None
        self.cur.execute("SELECT status FROM orders WHERE id = ?", (order_id,))
        row = self.cur.fetchone()
        status = row["status"] if row else None
        if value and status == "paid":
            shipped_at = now_iso()
            self.cur.execute(
                "UPDATE orders SET trackingNumber = ?, status = 'shipped', shippedAt = ? WHERE id = ?",
                (value, shipped_at, order_id),
            )
        else:
            self.cur.execute(
                "UPDATE orders SET trackingNumber = ? WHERE id = ?",
                (value, order_id),
            )
        self.conn.commit()

    def get_stats(self) -> Dict[str, Any]:
        self.cur.execute("SELECT COUNT(*) AS total FROM orders")
        total = int(self.cur.fetchone()["total"])
        self.cur.execute("SELECT COUNT(*) AS pending FROM orders WHERE status = 'pending'")
        pending = int(self.cur.fetchone()["pending"])
        self.cur.execute(
            "SELECT COALESCE(SUM(totalAmount), 0) AS revenue FROM orders WHERE status IN ('paid','shipped','delivered')"
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
