from __future__ import annotations

"""MySQL 连接与 SQLite 兼容适配层。

各业务模块仍以 sqlite3 风格调用（conn.execute / cur.execute、? 占位符、
row_to_dict、lastrowid、with conn 事务）。本模块提供一个轻量包装：
- 占位符 ? 自动转换为 %s（带 % 转义）
- DictCursor 让 fetch* 返回 dict
- 单例连接 + 线程锁，模拟原 SQLite 单连接模型
- 会话时区设为 +00:00，使 CURRENT_TIMESTAMP 与原 SQLite 一样按 UTC 记录
"""

import os
import threading
from pathlib import Path
from typing import Any, Iterable, List, Optional, Sequence

import pymysql
from pymysql.cursors import DictCursor

# 全局锁：单连接跨线程访问时序列化执行，避免 MySQL 协议错乱
_lock = threading.RLock()

_ENV_LOADED = False


def _load_env_file() -> None:
    """轻量加载项目根目录 .env（uvicorn 不会自动注入），仅填充缺失的键。"""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:
        pass


def get_mysql_config() -> dict:
    _load_env_file()
    return dict(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "yhthestudio_web"),
        charset="utf8mb4",
        autocommit=True,
        cursorclass=DictCursor,
        # 与原 SQLite 一致按 UTC 存取时间，避免前端时区偏移
        init_command="SET time_zone='+00:00'",
    )


def _translate(sql: str, params: Optional[Sequence[Any]]) -> str:
    """SQLite 占位符 ? → PyMySQL %s；有参数时转义字面量 %。"""
    if params:
        return sql.replace("%", "%%").replace("?", "%s")
    return sql.replace("?", "%s")


class CompatCursor:
    """包装 PyMySQL 游标，提供 sqlite3 风格接口。"""

    def __init__(self, conn: "CompatConnection") -> None:
        self._conn = conn
        self._cur = None
        self.lastrowid: Optional[int] = None
        self.rowcount: int = -1

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None) -> "CompatCursor":
        with _lock:
            raw = self._conn._raw_alive()
            self._cur = raw.cursor()
            self._cur.execute(_translate(sql, params), tuple(params) if params else None)
            self.lastrowid = self._cur.lastrowid
            self.rowcount = self._cur.rowcount
        return self

    def executemany(self, sql: str, seq: Iterable[Sequence[Any]]) -> "CompatCursor":
        seq_list = list(seq)
        with _lock:
            raw = self._conn._raw_alive()
            self._cur = raw.cursor()
            sample = seq_list[0] if seq_list else None
            self._cur.executemany(_translate(sql, sample), seq_list)
            self.lastrowid = self._cur.lastrowid
            self.rowcount = self._cur.rowcount
        return self

    def fetchone(self):
        return self._cur.fetchone() if self._cur is not None else None

    def fetchall(self) -> List[Any]:
        return self._cur.fetchall() if self._cur is not None else []

    def close(self) -> None:
        if self._cur is not None:
            try:
                self._cur.close()
            except Exception:
                pass


class CompatConnection:
    """包装 PyMySQL 连接，提供 sqlite3 风格接口。"""

    def __init__(self, raw: pymysql.connections.Connection) -> None:
        self._raw = raw

    def _raw_alive(self) -> pymysql.connections.Connection:
        """确保连接可用（处理 MySQL 空闲断开）。"""
        try:
            self._raw.ping(reconnect=True)
        except Exception:
            self._raw = pymysql.connect(**get_mysql_config())
        return self._raw

    def cursor(self) -> CompatCursor:
        return CompatCursor(self)

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None) -> CompatCursor:
        cur = CompatCursor(self)
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, seq: Iterable[Sequence[Any]]) -> CompatCursor:
        cur = CompatCursor(self)
        cur.executemany(sql, seq)
        return cur

    def commit(self) -> None:
        with _lock:
            try:
                self._raw.commit()
            except Exception:
                pass

    def rollback(self) -> None:
        with _lock:
            try:
                self._raw.rollback()
            except Exception:
                pass

    def close(self) -> None:
        try:
            self._raw.close()
        except Exception:
            pass

    def __enter__(self) -> "CompatConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        return False


_singleton: Optional[CompatConnection] = None


def connect_mysql() -> CompatConnection:
    """获取（单例）MySQL 兼容连接。"""
    global _singleton
    with _lock:
        if _singleton is None:
            raw = pymysql.connect(**get_mysql_config())
            _singleton = CompatConnection(raw)
    return _singleton


def close_mysql() -> None:
    global _singleton
    with _lock:
        if _singleton is not None:
            _singleton.close()
            _singleton = None


def column_exists(conn: CompatConnection, table: str, column: str) -> bool:
    cur = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
        """,
        (table, column),
    )
    return cur.fetchone() is not None


def add_column_if_missing(conn: CompatConnection, table: str, column: str, ddl: str) -> None:
    """列不存在时执行 ALTER TABLE ADD COLUMN（ddl 形如 'INT DEFAULT 0'）。"""
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def table_exists(conn: CompatConnection, table: str) -> bool:
    cur = conn.execute(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?
        """,
        (table,),
    )
    return cur.fetchone() is not None


def list_table_names(conn: CompatConnection) -> List[str]:
    cur = conn.execute(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()"
    )
    return [row["name"] for row in cur.fetchall()]
