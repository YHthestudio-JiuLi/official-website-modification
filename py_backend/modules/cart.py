from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class CartManager:
    """
    购物车管理器
    
    注意：所有写操作都使用 SQLite 的事务原子性来保证线程安全，
    不需要额外的全局锁。SQLite 的 WAL 模式下，读写可以并发进行，
    写操作会自动加锁保证原子性。
    """
    
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cart (
              id INT AUTO_INCREMENT PRIMARY KEY,
              userId INT NOT NULL,
              productId INT NOT NULL,
              quantity INT NOT NULL DEFAULT 1,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uniq_cart_user_product (userId, productId),
              KEY idx_cart_userId (userId),
              KEY idx_cart_productId (productId),
              CONSTRAINT fk_cart_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
              CONSTRAINT fk_cart_product FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def get_cart(self, user_id: int) -> List[Dict[str, Any]]:
        """获取用户购物车列表（只读操作，无需锁）"""
        self.cur.execute(
            """
            SELECT c.id, c.userId, c.productId, c.quantity, c.createdAt, c.updatedAt,
                   p.name, p.description, p.image, p.price, p.priceUsdt
            FROM cart c
            JOIN products p ON c.productId = p.id
            WHERE c.userId = ?
            ORDER BY c.createdAt DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in self.cur.fetchall()]

    def add_item(self, user_id: int, product_id: int, quantity: int = 1) -> int:
        """
        添加商品到购物车
        
        使用 INSERT ... ON CONFLICT DO UPDATE 实现原子操作：
        - 如果商品已存在，数量累加
        - 如果商品不存在，插入新记录
        
        SQLite 的事务原子性保证线程安全，无需额外锁
        """
        with self.conn:
            self.cur.execute(
                """
                INSERT INTO cart (userId, productId, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    quantity = quantity + VALUES(quantity),
                    updatedAt = CURRENT_TIMESTAMP
                """,
                (user_id, product_id, quantity),
            )
            return int(self.cur.lastrowid)

    def update_quantity(self, user_id: int, product_id: int, quantity: int) -> None:
        """
        更新购物车商品数量
        
        - 如果数量 <= 0，删除商品
        - 否则更新数量
        
        SQLite 的事务原子性保证线程安全，无需额外锁
        """
        with self.conn:
            if quantity <= 0:
                self.cur.execute(
                    "DELETE FROM cart WHERE userId = ? AND productId = ?",
                    (user_id, product_id),
                )
            else:
                self.cur.execute(
                    """
                    UPDATE cart SET quantity = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE userId = ? AND productId = ?
                    """,
                    (quantity, user_id, product_id),
                )

    def remove_item(self, user_id: int, product_id: int) -> None:
        """从购物车移除商品（SQLite 事务原子性保证线程安全）"""
        with self.conn:
            self.cur.execute(
                "DELETE FROM cart WHERE userId = ? AND productId = ?",
                (user_id, product_id),
            )

    def clear_cart(self, user_id: int) -> None:
        """清空购物车（SQLite 事务原子性保证线程安全）"""
        with self.conn:
            self.cur.execute("DELETE FROM cart WHERE userId = ?", (user_id,))

    def get_item(self, user_id: int, product_id: int) -> Optional[Dict[str, Any]]:
        """获取购物车中的单个商品（只读操作，无需锁）"""
        self.cur.execute(
            "SELECT * FROM cart WHERE userId = ? AND productId = ?",
            (user_id, product_id),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None
