from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .modules import DatabaseManager
from .utils import connect, validate_table_name, row_to_dict, rows_to_dict


class RpcRequest(BaseModel):
    op: str = Field(..., description="Operation name, e.g. users.findById")
    args: Dict[str, Any] = Field(default_factory=dict)


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = connect()
    try:
        db_manager = DatabaseManager(conn)
        db_manager.init_db()
    finally:
        conn.close()
    yield


app = FastAPI(title="YH_Web Python DB Backend", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> Dict[str, Any]:
    from .utils import DB_PATH
    return {"ok": True, "db_path": str(DB_PATH)}


@app.post("/rpc")
def rpc(req: RpcRequest) -> Dict[str, Any]:
    conn = connect()
    try:
        db_manager = DatabaseManager(conn)
        result = dispatch(db_manager, req.op, req.args)
        return {"ok": True, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        conn.close()


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

    raise ValueError(f"Unknown op: {op}")
