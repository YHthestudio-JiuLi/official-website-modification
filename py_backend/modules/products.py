from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict, generate_placeholder_svg


class ProductManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              description TEXT,
              image TEXT,
              date TEXT,
              price REAL DEFAULT 0,
              priceUsdt REAL DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_products_date ON products(date)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_products_createdAt ON products(createdAt)")

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM products ORDER BY date DESC, id DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, product_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        name: str,
        description: Optional[str],
        image: Optional[str],
        date: Optional[str],
        price: float = 0,
        price_usdt: float = 0,
    ) -> int:
        self.cur.execute(
            "INSERT INTO products (name, description, image, date, price, priceUsdt) VALUES (?, ?, ?, ?, ?, ?)",
            (name, description, image, date, price, price_usdt),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(
        self,
        product_id: int,
        name: str,
        description: Optional[str],
        image: Optional[str],
        date: Optional[str],
        price: float,
        price_usdt: float,
    ) -> None:
        self.cur.execute(
            "UPDATE products SET name = ?, description = ?, image = ?, date = ?, price = ?, priceUsdt = ? WHERE id = ?",
            (name, description, image, date, price, price_usdt, product_id),
        )
        self.conn.commit()

    def delete(self, product_id: int) -> None:
        self.cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
        self.conn.commit()

    def seed_sample_data(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS count FROM products")
        if (self.cur.fetchone()["count"] or 0) == 0:
            products = [
                (
                    "智能 AI 助手",
                    "基于大语言模型的智能助手，提供 24/7 服务",
                    generate_placeholder_svg("智能 AI 助手"),
                    "2024-01-15",
                    99.99,
                    99.99,
                ),
                (
                    "云端协作平台",
                    "高效的团队协作工具，支持实时同步",
                    generate_placeholder_svg("云端协作平台"),
                    "2024-01-20",
                    199.99,
                    199.99,
                ),
                (
                    "数据分析系统",
                    "强大的数据分析和可视化平台",
                    generate_placeholder_svg("数据分析系统"),
                    "2024-02-01",
                    299.99,
                    299.99,
                ),
            ]
            self.cur.executemany(
                "INSERT INTO products (name, description, image, date, price, priceUsdt) VALUES (?, ?, ?, ?, ?, ?)",
                products,
            )
            self.conn.commit()
