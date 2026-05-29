from __future__ import annotations

import re
import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import row_to_dict, rows_to_dict


def _slugify(text: str) -> str:
    """生成 URL 友好的 slug"""
    raw = (text or "").strip().lower()
    raw = re.sub(r"[^\w\s-]", "", raw, flags=re.UNICODE)
    raw = re.sub(r"[\s_]+", "-", raw).strip("-")
    return raw or "category"


class ProductCategoryManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS product_categories (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              nameEn VARCHAR(255),
              slug VARCHAR(255) NOT NULL UNIQUE,
              parentId INT NULL,
              sortOrder INT DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_product_categories_sort (sortOrder, id),
              KEY idx_product_categories_parent (parentId)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        self._ensure_parent_id_column()

    def _ensure_parent_id_column(self) -> None:
        """已有库升级：二级分类父级 parentId"""
        from ..db import add_column_if_missing

        add_column_if_missing(self.conn, "product_categories", "parentId", "INT NULL")

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT c.*,
                   p.name AS parentName,
                   p.nameEn AS parentNameEn
            FROM product_categories c
            LEFT JOIN product_categories p ON c.parentId = p.id
            ORDER BY
              CASE WHEN c.parentId IS NULL THEN c.sortOrder ELSE p.sortOrder END ASC,
              CASE WHEN c.parentId IS NULL THEN c.id ELSE c.parentId END ASC,
              (c.parentId IS NOT NULL) ASC,
              c.sortOrder ASC,
              c.id ASC
            """
        )
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, category_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM product_categories WHERE id = ?", (category_id,))
        return row_to_dict(self.cur.fetchone())

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM product_categories WHERE slug = ?", (slug,))
        return row_to_dict(self.cur.fetchone())

    def _validate_parent(self, parent_id: Optional[int], category_id: Optional[int] = None) -> None:
        """校验父级分类：仅支持二级，不可嵌套三级"""
        if parent_id is None:
            return
        parent = self.find_by_id(int(parent_id))
        if not parent:
            raise ValueError("Parent category not found")
        if parent.get("parentId"):
            raise ValueError("Only two-level categories are supported")
        if category_id is not None and int(parent_id) == int(category_id):
            raise ValueError("Category cannot be its own parent")

    def create(
        self,
        name: str,
        name_en: Optional[str] = None,
        slug: Optional[str] = None,
        sort_order: int = 0,
        parent_id: Optional[int] = None,
    ) -> int:
        self._validate_parent(parent_id)
        final_slug = (slug or _slugify(name)).strip()
        if not final_slug:
            final_slug = "category"
        base = final_slug
        n = 1
        while self.find_by_slug(final_slug):
            final_slug = f"{base}-{n}"
            n += 1
        self.cur.execute(
            "INSERT INTO product_categories (name, nameEn, slug, parentId, sortOrder) VALUES (?, ?, ?, ?, ?)",
            (
                name.strip(),
                (name_en or "").strip() or None,
                final_slug,
                int(parent_id) if parent_id else None,
                int(sort_order or 0),
            ),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(
        self,
        category_id: int,
        name: str,
        name_en: Optional[str] = None,
        slug: Optional[str] = None,
        sort_order: int = 0,
        parent_id: Optional[int] = None,
    ) -> None:
        existing = self.find_by_id(category_id)
        if not existing:
            raise ValueError("Category not found")
        # 有子分类的一级分类不能改为二级
        if parent_id is not None:
            self._validate_parent(parent_id, category_id)
            self.cur.execute(
                "SELECT COUNT(*) AS c FROM product_categories WHERE parentId = ?",
                (category_id,),
            )
            if (self.cur.fetchone()["c"] or 0) > 0:
                raise ValueError("Cannot move a parent category that has subcategories")
        final_slug = (slug or existing.get("slug") or _slugify(name)).strip()
        other = self.find_by_slug(final_slug)
        if other and int(other["id"]) != int(category_id):
            raise ValueError("Slug already exists")
        self.cur.execute(
            "UPDATE product_categories SET name = ?, nameEn = ?, slug = ?, parentId = ?, sortOrder = ? WHERE id = ?",
            (
                name.strip(),
                (name_en or "").strip() or None,
                final_slug,
                int(parent_id) if parent_id else None,
                int(sort_order or 0),
                category_id,
            ),
        )
        self.conn.commit()

    def _clear_products_for_category(self, category_id: int) -> None:
        """删除分类时解除商品关联"""
        self.cur.execute("UPDATE products SET subCategoryId = NULL WHERE subCategoryId = ?", (category_id,))
        self.cur.execute("UPDATE products SET categoryId = NULL WHERE categoryId = ?", (category_id,))

    def delete(self, category_id: int) -> None:
        existing = self.find_by_id(category_id)
        if not existing:
            raise ValueError("Category not found")
        # 先删除子分类
        self.cur.execute("SELECT id FROM product_categories WHERE parentId = ?", (category_id,))
        child_ids = [int(row["id"]) for row in self.cur.fetchall()]
        for child_id in child_ids:
            self._clear_products_for_category(child_id)
            self.cur.execute("DELETE FROM product_categories WHERE id = ?", (child_id,))
        self._clear_products_for_category(category_id)
        self.cur.execute("DELETE FROM product_categories WHERE id = ?", (category_id,))
        self.conn.commit()

    def seed_defaults(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS c FROM product_categories")
        if (self.cur.fetchone()["c"] or 0) > 0:
            return
        defaults = [
            ("智能眼镜", "Smart Glasses", "smart-glasses", None, 10),
            ("软件定制", "Software", "software", None, 20),
            ("配件周边", "Accessories", "accessories", None, 30),
            ("其他", "Other", "other", None, 99),
        ]
        self.cur.executemany(
            "INSERT INTO product_categories (name, nameEn, slug, parentId, sortOrder) VALUES (?, ?, ?, ?, ?)",
            defaults,
        )
        self.conn.commit()
