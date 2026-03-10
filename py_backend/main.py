from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .modules import DatabaseManager
from .utils import connect, validate_table_name, row_to_dict, rows_to_dict

# 配置日志
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

class JsonFormatter(logging.Formatter):
    """JSON 格式的日志格式化器"""
    def format(self, record):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exc_info"] = self.formatException(record.exc_info)
        if hasattr(record, 'extra_data'):
            log_entry.update(record.extra_data)
        return json.dumps(log_entry)

# 创建 logger
logger = logging.getLogger("py_backend")
logger.setLevel(getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper()))

# 文件处理器
file_handler = logging.FileHandler(LOG_DIR / "py_backend.log", encoding="utf-8")
file_handler.setFormatter(JsonFormatter())
logger.addHandler(file_handler)

# 错误文件处理器
error_handler = logging.FileHandler(LOG_DIR / "py_backend_error.log", encoding="utf-8")
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(JsonFormatter())
logger.addHandler(error_handler)

# 控制台处理器（开发环境）
if os.environ.get("NODE_ENV", "development") == "development":
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(console_handler)


class RpcRequest(BaseModel):
    op: str = Field(..., description="Operation name, e.g. users.findById")
    args: Dict[str, Any] = Field(default_factory=dict)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 初始化数据库连接（使用单例模式，连接由应用生命周期管理）
    conn = connect()
    try:
        db_manager = DatabaseManager(conn)
        db_manager.init_db()
        logger.info("Python backend initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    yield
    # 应用关闭时关闭数据库连接
    from .utils import DatabaseConnection
    DatabaseConnection.close()
    logger.info("Python backend shutdown complete")


app = FastAPI(title="YH_Web Python DB Backend", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> Dict[str, Any]:
    from .utils import DB_PATH
    return {"ok": True, "db_path": str(DB_PATH)}


@app.post("/rpc")
def rpc(req: RpcRequest) -> Dict[str, Any]:
    # 注意：connect() 返回的是单例连接实例，由应用生命周期统一管理
    # 不需要在每次 RPC 调用后关闭连接
    conn = connect()
    try:
        logger.info(f"RPC call: {req.op}", extra={"extra_data": {"op": req.op, "args": req.args}})
        db_manager = DatabaseManager(conn)
        result = dispatch(db_manager, req.op, req.args)
        logger.info(f"RPC call completed: {req.op}")
        return {"ok": True, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RPC call failed: {req.op} - {str(e)}", extra={"extra_data": {"op": req.op, "error": str(e)}})
        raise HTTPException(status_code=400, detail=str(e)) from e


def dispatch(db_manager: DatabaseManager, op: str, args: Dict[str, Any]) -> Any:
    conn = db_manager.conn

    if op == "meta.listTables":
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC")
        return [r["name"] for r in cur.fetchall()]
    if op == "meta.tableData":
        table = str(args["table"])
        if not validate_table_name(table):
            raise ValueError("invalid table name")
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM {table}")
        return rows_to_dict(cur.fetchall())
    if op == "meta.tableCount":
        table = str(args["table"])
        if not validate_table_name(table):
            raise ValueError("invalid table name")
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
        row = cur.fetchone()
        return int(row["count"] if row else 0)

    if op == "users.findAll":
        return db_manager.users.find_all()
    if op == "users.findById":
        return db_manager.users.find_by_id(args["id"])
    if op == "users.findByUsername":
        return db_manager.users.find_by_username(args["username"])
    if op == "users.findByEmail":
        return db_manager.users.find_by_email(args["email"])
    if op == "users.create":
        return db_manager.users.create(
            args["username"],
            args["email"],
            args["password"],
            int(args.get("isAdmin", 0)),
        )
    if op == "users.update":
        return db_manager.users.update(
            args["id"],
            args["email"],
            args.get("password"),
            int(args["isAdmin"]),
        )
    if op == "users.delete":
        return db_manager.users.delete(args["id"])

    if op == "products.findAll":
        return db_manager.products.find_all()
    if op == "products.findById":
        return db_manager.products.find_by_id(args["id"])
    if op == "products.create":
        return db_manager.products.create(
            args["name"],
            args.get("description"),
            args.get("image"),
            args.get("date"),
            args.get("price", 0),
            args.get("priceUsdt", 0),
        )
    if op == "products.update":
        return db_manager.products.update(
            args["id"],
            args["name"],
            args.get("description"),
            args.get("image"),
            args.get("date"),
            args.get("price", 0),
            args.get("priceUsdt", 0),
        )
    if op == "products.delete":
        return db_manager.products.delete(args["id"])

    if op == "orders.findAll":
        status_filter = str(args.get("statusFilter", "") or "").strip()
        return db_manager.orders.find_all(status_filter if status_filter else None)
    if op == "orders.findById":
        return db_manager.orders.find_by_id(args["id"])
    if op == "orders.findByUserId":
        return db_manager.orders.find_by_user_id(args["userId"])
    if op == "orders.create":
        return db_manager.orders.create(args["orderData"])
    if op == "orders.updateStatus":
        return db_manager.orders.update_status(args["id"], args["status"])
    if op == "orders.updateTxHash":
        return db_manager.orders.update_tx_hash(args["id"], args["txHash"])
    if op == "orders.updateShippingAddress":
        return db_manager.orders.update_shipping_address(args["id"], args["shippingAddress"])
    if op == "orders.getStats":
        return db_manager.orders.get_stats()
    if op == "orders.delete":
        return db_manager.orders.delete(args["id"])
    if op == "orders.deleteExpiredPending":
        return db_manager.orders.delete_expired_pending(int(args["minutes"]))

    if op == "forumPosts.findAll":
        return db_manager.forum_posts.find_all()
    if op == "forumPosts.findById":
        return db_manager.forum_posts.find_by_id(args["id"])
    if op == "forumPosts.create":
        return db_manager.forum_posts.create(
            args["title"],
            args["author"],
            args["content"],
            args.get("date"),
            int(args.get("replies", 0)),
        )
    if op == "forumPosts.update":
        return db_manager.forum_posts.update(
            args["id"],
            args["title"],
            args["author"],
            args["content"],
            args.get("date"),
            int(args.get("replies", 0)),
        )
    if op == "forumPosts.togglePin":
        return db_manager.forum_posts.toggle_pin(args["id"])
    if op == "forumPosts.delete":
        return db_manager.forum_posts.delete(args["id"])
    if op == "forumPosts.incrementReplies":
        return db_manager.forum_posts.increment_replies(args["id"])

    if op == "forumReplies.findByPostId":
        return db_manager.forum_replies.find_by_post_id(args["postId"])
    if op == "forumReplies.findById":
        return db_manager.forum_replies.find_by_id(args["id"])
    if op == "forumReplies.create":
        return db_manager.forum_replies.create(
            args["postId"],
            args["author"],
            args["content"],
            args.get("parentReplyId"),
        )
    if op == "forumReplies.delete":
        return db_manager.forum_replies.delete(args["id"])

    if op == "paymentSettings.get":
        return db_manager.payment_settings.get()
    if op == "paymentSettings.update":
        return db_manager.payment_settings.update(
            args["walletAddress"],
            args.get("network", "TRC20"),
            int(args.get("autoDeleteMinutes", 30)),
        )

    # Cart operations
    if op == "cart.get":
        return db_manager.cart.get_cart(args["userId"])
    if op == "cart.addItem":
        return db_manager.cart.add_item(args["userId"], args["productId"], int(args.get("quantity", 1)))
    if op == "cart.updateQuantity":
        return db_manager.cart.update_quantity(args["userId"], args["productId"], int(args["quantity"]))
    if op == "cart.removeItem":
        return db_manager.cart.remove_item(args["userId"], args["productId"])
    if op == "cart.clear":
        return db_manager.cart.clear_cart(args["userId"])

    raise ValueError(f"Unknown op: {op}")
