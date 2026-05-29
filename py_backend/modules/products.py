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
              id INT AUTO_INCREMENT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT,
              image LONGTEXT,
              date VARCHAR(64),
              price DOUBLE DEFAULT 0,
              priceUsdt DOUBLE DEFAULT 0,
              featuresJson LONGTEXT,
              specsJson LONGTEXT,
              usageNoticeJson LONGTEXT,
              categoryId INT,
              subCategoryId INT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_products_date (date),
              KEY idx_products_createdAt (createdAt),
              KEY idx_products_category (categoryId),
              KEY idx_products_sub_category (subCategoryId)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        self._ensure_features_json_column()
        self._ensure_specs_json_column()
        self._ensure_usage_notice_json_column()
        self._ensure_category_id_column()
        self._ensure_sub_category_id_column()

    def _ensure_category_id_column(self) -> None:
        """已有库升级：商品一级分类 categoryId"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "products", "categoryId", "INT")

    def _ensure_sub_category_id_column(self) -> None:
        """已有库升级：商品二级分类 subCategoryId"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "products", "subCategoryId", "INT")

    _PRODUCT_SELECT = """
        SELECT p.*,
               c.name AS categoryName,
               c.nameEn AS categoryNameEn,
               c.slug AS categorySlug,
               sc.name AS subCategoryName,
               sc.nameEn AS subCategoryNameEn,
               sc.slug AS subCategorySlug
        FROM products p
        LEFT JOIN product_categories c ON p.categoryId = c.id
        LEFT JOIN product_categories sc ON p.subCategoryId = sc.id
    """

    def _ensure_features_json_column(self) -> None:
        """已有库升级：功能卡 JSON 存 featuresJson"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "products", "featuresJson", "LONGTEXT")

    def _ensure_specs_json_column(self) -> None:
        """已有库升级：技术规格卡 JSON 存 specsJson"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "products", "specsJson", "LONGTEXT")

    def _ensure_usage_notice_json_column(self) -> None:
        """已有库升级：详情页「重要说明」多行 JSON 存 usageNoticeJson"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "products", "usageNoticeJson", "LONGTEXT")

    def _validate_categories(
        self,
        category_id: Optional[int],
        sub_category_id: Optional[int],
    ) -> None:
        """校验一级/二级分类关联"""
        if sub_category_id is not None and category_id is None:
            raise ValueError("Subcategory requires a parent category")
        if sub_category_id is None:
            return
        self.cur.execute(
            "SELECT id, parentId FROM product_categories WHERE id = ?",
            (int(sub_category_id),),
        )
        sub = self.cur.fetchone()
        if not sub:
            raise ValueError("Subcategory not found")
        if not sub.get("parentId"):
            raise ValueError("Invalid subcategory")
        if int(sub["parentId"]) != int(category_id):
            raise ValueError("Subcategory does not belong to the selected category")

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(f"{self._PRODUCT_SELECT} ORDER BY p.date DESC, p.id DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, product_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(f"{self._PRODUCT_SELECT} WHERE p.id = ?", (product_id,))
        return row_to_dict(self.cur.fetchone())

    def create(
        self,
        name: str,
        description: Optional[str],
        image: Optional[str],
        date: Optional[str],
        price: float = 0,
        price_usdt: float = 0,
        features_json: Optional[str] = None,
        specs_json: Optional[str] = None,
        usage_notice_json: Optional[str] = None,
        category_id: Optional[int] = None,
        sub_category_id: Optional[int] = None,
    ) -> int:
        self._validate_categories(category_id, sub_category_id)
        self.cur.execute(
            """
            INSERT INTO products (
              name, description, image, date, price, priceUsdt,
              featuresJson, specsJson, usageNoticeJson, categoryId, subCategoryId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                description,
                image,
                date,
                price,
                price_usdt,
                features_json,
                specs_json,
                usage_notice_json,
                category_id,
                sub_category_id,
            ),
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
        features_json: Optional[str] = None,
        specs_json: Optional[str] = None,
        usage_notice_json: Optional[str] = None,
        category_id: Optional[int] = None,
        sub_category_id: Optional[int] = None,
    ) -> None:
        self._validate_categories(category_id, sub_category_id)
        self.cur.execute(
            """
            UPDATE products SET
              name = ?, description = ?, image = ?, date = ?,
              price = ?, priceUsdt = ?, featuresJson = ?, specsJson = ?,
              usageNoticeJson = ?, categoryId = ?, subCategoryId = ?
            WHERE id = ?
            """,
            (
                name,
                description,
                image,
                date,
                price,
                price_usdt,
                features_json,
                specs_json,
                usage_notice_json,
                category_id,
                sub_category_id,
                product_id,
            ),
        )
        self.conn.commit()

    def delete(self, product_id: int) -> None:
        self.cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
        self.conn.commit()

    def seed_sample_data(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS count FROM products")
        if (self.cur.fetchone()["count"] or 0) > 0:
            return
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
