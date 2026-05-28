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
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              nameEn TEXT,
              slug TEXT NOT NULL UNIQUE,
              sortOrder INTEGER DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_product_categories_sort ON product_categories(sortOrder, id)"
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            "SELECT * FROM product_categories ORDER BY sortOrder ASC, id ASC"
        )
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, category_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM product_categories WHERE id = ?", (category_id,))
        return row_to_dict(self.cur.fetchone())

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM product_categories WHERE slug = ?", (slug,))
        return row_to_dict(self.cur.fetchone())

    def create(self, name: str, name_en: Optional[str] = None, slug: Optional[str] = None, sort_order: int = 0) -> int:
        final_slug = (slug or _slugify(name)).strip()
        if not final_slug:
            final_slug = "category"
        # slug 冲突时追加 id 后缀由调用方处理；此处简单递增
        base = final_slug
        n = 1
        while self.find_by_slug(final_slug):
            final_slug = f"{base}-{n}"
            n += 1
        self.cur.execute(
            "INSERT INTO product_categories (name, nameEn, slug, sortOrder) VALUES (?, ?, ?, ?)",
            (name.strip(), (name_en or "").strip() or None, final_slug, int(sort_order or 0)),
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
    ) -> None:
        existing = self.find_by_id(category_id)
        if not existing:
            raise ValueError("Category not found")
        final_slug = (slug or existing.get("slug") or _slugify(name)).strip()
        other = self.find_by_slug(final_slug)
        if other and int(other["id"]) != int(category_id):
            raise ValueError("Slug already exists")
        self.cur.execute(
            "UPDATE product_categories SET name = ?, nameEn = ?, slug = ?, sortOrder = ? WHERE id = ?",
            (name.strip(), (name_en or "").strip() or None, final_slug, int(sort_order or 0), category_id),
        )
        self.conn.commit()

    def delete(self, category_id: int) -> None:
        # 删除分类时将商品 categoryId 置空
        self.cur.execute("UPDATE products SET categoryId = NULL WHERE categoryId = ?", (category_id,))
        self.cur.execute("DELETE FROM product_categories WHERE id = ?", (category_id,))
        self.conn.commit()

    def seed_defaults(self) -> None:
        self.cur.execute("SELECT COUNT(*) AS c FROM product_categories")
        if (self.cur.fetchone()["c"] or 0) > 0:
            return
        defaults = [
            ("智能眼镜", "Smart Glasses", "smart-glasses", 10),
            ("软件定制", "Software", "software", 20),
            ("配件周边", "Accessories", "accessories", 30),
            ("其他", "Other", "other", 99),
        ]
        self.cur.executemany(
            "INSERT INTO product_categories (name, nameEn, slug, sortOrder) VALUES (?, ?, ?, ?)",
            defaults,
        )
        self.conn.commit()
