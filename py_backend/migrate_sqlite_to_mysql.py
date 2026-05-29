from __future__ import annotations

"""SQLite → MySQL 数据迁移脚本。

用法（项目根目录）：
    .venv/bin/python -m py_backend.migrate_sqlite_to_mysql

行为：
1. 在 MySQL 中建好全部表结构（DatabaseManager.init_db，会写入默认种子）。
2. 关闭外键检查，按表把 SQLite 数据复制到 MySQL（先清空目标表再插入，保留主键）。
3. 产品图片：原 image 字段若指向 /uploads/products/ 磁盘文件，则把文件读入
   MySQL images 表（BLOB），并将 image 改写为 /api/product-images/<id>。
4. 固件/题库等大文件仍保留在磁盘，仅迁移其元数据与路径。

可重复执行（每次会清空并重灌 MySQL 业务表）。
"""

import base64
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

# 强制以 MySQL 作为目标后端
os.environ.setdefault("DB_BACKEND", "mysql")

from .db import connect_mysql, list_table_names
from .modules import DatabaseManager
from .utils import DB_PATH

BASE_DIR = Path(__file__).resolve().parents[1]
PRODUCT_UPLOAD_DIR = BASE_DIR / "uploads" / "products"

# 这些表由结构/种子流程管理，不从 SQLite 直接覆盖
SKIP_TABLES = {"images"}


def sqlite_tables(sconn: sqlite3.Connection) -> List[str]:
    cur = sconn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    return [r[0] for r in cur.fetchall()]


def sqlite_columns(sconn: sqlite3.Connection, table: str) -> List[str]:
    cur = sconn.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def mysql_columns(mconn, table: str) -> List[str]:
    cur = mconn.execute(
        """
        SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return [r["name"] for r in cur.fetchall()]


def store_product_image(mconn, image_value: str) -> str:
    """磁盘产品图片转入 MySQL BLOB，返回新的 /api/product-images/<id> 引用。"""
    if not isinstance(image_value, str) or not image_value.startswith("/uploads/products/"):
        return image_value
    filename = os.path.basename(image_value)
    file_path = PRODUCT_UPLOAD_DIR / filename
    if not file_path.exists():
        # 文件缺失则保留原值，避免丢引用
        return image_value
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml",
    }.get(ext, "application/octet-stream")
    raw = file_path.read_bytes()
    cur = mconn.execute(
        "INSERT INTO images (filename, mime, data, size) VALUES (?, ?, ?, ?)",
        (filename, mime, raw, len(raw)),
    )
    new_id = int(cur.lastrowid)
    return f"/api/product-images/{new_id}"


def migrate_table(sconn: sqlite3.Connection, mconn, table: str) -> int:
    s_cols = set(sqlite_columns(sconn, table))
    m_cols = mysql_columns(mconn, table)
    cols = [c for c in m_cols if c in s_cols]
    if not cols:
        return 0

    scur = sconn.cursor()
    scur.execute(f"SELECT {', '.join(cols)} FROM {table}")
    rows = scur.fetchall()

    mconn.execute(f"TRUNCATE TABLE {table}")
    if not rows:
        return 0

    placeholders = ", ".join(["?"] * len(cols))
    col_list = ", ".join(f"`{c}`" for c in cols)
    insert_sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"

    inserted = 0
    image_idx = cols.index("image") if (table == "products" and "image" in cols) else -1
    for row in rows:
        values: List[Any] = list(row)
        if image_idx >= 0:
            values[image_idx] = store_product_image(mconn, values[image_idx])
        mconn.execute(insert_sql, values)
        inserted += 1
    return inserted


def main() -> None:
    if not Path(DB_PATH).exists():
        print(f"[迁移] 未找到 SQLite 数据库：{DB_PATH}，跳过数据复制（仅建表）")

    mconn = connect_mysql()
    print("[迁移] 在 MySQL 建表并写入默认种子 ...")
    DatabaseManager(mconn).init_db()

    if not Path(DB_PATH).exists():
        print("[迁移] 完成（无源数据）")
        return

    sconn = sqlite3.connect(str(DB_PATH))
    sconn.row_factory = sqlite3.Row

    mysql_existing = set(list_table_names(mconn))
    src_tables = sqlite_tables(sconn)

    mconn.execute("SET FOREIGN_KEY_CHECKS = 0")
    total = 0
    for table in src_tables:
        if table in SKIP_TABLES or table not in mysql_existing:
            print(f"[迁移] 跳过表 {table}")
            continue
        try:
            n = migrate_table(sconn, mconn, table)
            total += n
            print(f"[迁移] {table}: {n} 行")
        except Exception as e:
            print(f"[迁移] 表 {table} 失败：{e}")
    mconn.execute("SET FOREIGN_KEY_CHECKS = 1")
    mconn.commit()
    sconn.close()
    print(f"[迁移] 全部完成，共复制 {total} 行")


if __name__ == "__main__":
    main()
