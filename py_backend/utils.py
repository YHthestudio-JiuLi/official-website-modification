from __future__ import annotations

import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DB_PATH = Path(os.environ.get("YH_DB_PATH", str(DATA_DIR / "yhthestudio.db")))

DEFAULT_ADMIN_BCRYPT_HASH = (
    "$2b$10$L44E.0mupOj9DbN5rZnIJuhF7v9K1zjP6xglMiaNoEsFYoHJ/HPH."
)

# 全局锁用于线程安全的数据库访问
_db_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_placeholder_svg(text: str, width: int = 400, height: int = 300) -> str:
    import urllib.parse

    safe_id = "".join(text.split())
    svg = f"""<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad{safe_id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1f3a;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0a0e27;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grad{safe_id})"/>
    <circle cx="{width/2}" cy="{height/2 - 30}" r="40" fill="none" stroke="#00d4ff" stroke-width="2" opacity="0.5"/>
    <text x="50%" y="60%" font-family="Arial, sans-serif" font-size="20" fill="#00d4ff" text-anchor="middle" dominant-baseline="middle" font-weight="bold">{text}</text>
  </svg>"""
    encoded = urllib.parse.quote(svg)
    return "data:image/svg+xml;charset=utf-8," + encoded


class DatabaseConnection:
    """单例数据库连接类（线程安全）"""
    _instance = None
    _conn = None
    _lock = threading.Lock()
    
    @classmethod
    def get_connection(cls) -> sqlite3.Connection:
        """获取数据库连接（线程安全）"""
        with cls._lock:
            if cls._conn is None:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                cls._conn = sqlite3.connect(DB_PATH, check_same_thread=False)
                cls._conn.row_factory = sqlite3.Row
                # 启用 WAL 模式以提高并发性能
                cls._conn.execute("PRAGMA journal_mode=WAL")
        return cls._conn
    
    @classmethod
    def close(cls):
        """关闭数据库连接"""
        with cls._lock:
            if cls._conn is not None:
                cls._conn.close()
                cls._conn = None


def connect():
    """获取数据库连接：默认 MySQL，可通过 DB_BACKEND=sqlite 回退到 SQLite。"""
    backend = os.environ.get("DB_BACKEND", "mysql").strip().lower()
    if backend == "sqlite":
        return DatabaseConnection.get_connection()
    from .db import connect_mysql
    return connect_mysql()


def connect_sqlite() -> sqlite3.Connection:
    """显式获取 SQLite 连接（数据迁移脚本使用）。"""
    return DatabaseConnection.get_connection()


def get_db_lock() -> threading.Lock:
    """获取全局数据库锁，用于写操作同步"""
    return _db_lock


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def rows_to_dict(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [{k: row[k] for k in row.keys()} for row in rows]


def validate_table_name(table: str) -> bool:
    return table.replace("_", "").isalnum()
