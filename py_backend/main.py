from __future__ import annotations

import json
import logging
import os
import sqlite3
import asyncio
import shutil
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from .modules import DatabaseManager
from .utils import connect, validate_table_name, row_to_dict, rows_to_dict
from .controller import questions_router

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
    conn = connect()
    try:
        db_manager = DatabaseManager(conn)
        db_manager.init_db()
        logger.info("Python backend initialized successfully")
        
        async def chat_cleanup_task():
            while True:
                await asyncio.sleep(60 * 60)
                try:
                    logger.info("Running scheduled chat cleanup task")
                    db_manager.chat_messages.cleanup_expired(3)
                except Exception as e:
                    logger.error(f"Chat cleanup task error: {e}")
                    
        app.state.chat_cleanup = asyncio.create_task(chat_cleanup_task())
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    yield
    from .utils import DatabaseConnection
    DatabaseConnection.close()
    try:
        from .db import close_mysql
        close_mysql()
    except Exception:
        pass
    if hasattr(app.state, 'chat_cleanup'):
        app.state.chat_cleanup.cancel()
    logger.info("Python backend shutdown complete")


app = FastAPI(title="YH_Web Python DB Backend", version="1.0.0", lifespan=lifespan)

app.include_router(questions_router)


@app.get("/health")
def health() -> Dict[str, Any]:
    backend = os.environ.get("DB_BACKEND", "mysql").strip().lower()
    return {"ok": True, "backend": backend}


@app.post("/rpc")
def rpc(req: RpcRequest) -> Dict[str, Any]:
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
    def parse_bool(value: Any, default: bool = True) -> bool:
        # 兼容前端/第三方请求中的字符串布尔值，避免 bool("false") 被误判为 True
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            v = value.strip().lower()
            if v in {"true", "1", "yes", "y", "on"}:
                return True
            if v in {"false", "0", "no", "n", "off", ""}:
                return False
        return default

    def parse_popup_scope_args(scope_args: Dict[str, Any], default: bool = True) -> tuple[bool, bool]:
        """解析弹窗/展示双开关；兼容旧版仅传 enabled"""
        legacy = scope_args.get("enabled")
        popup_raw = scope_args.get("popup_enabled")
        display_raw = scope_args.get("display_enabled")
        if popup_raw is None and display_raw is None and legacy is not None:
            legacy_bool = parse_bool(legacy, default)
            return legacy_bool, legacy_bool
        return parse_bool(popup_raw, default), parse_bool(display_raw, default)

    if op == "meta.listTables":
        from .db import list_table_names
        return sorted(list_table_names(conn))
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

    if op == "images.create":
        return db_manager.images.create(
            args["dataBase64"],
            args.get("mime", "application/octet-stream"),
            args.get("filename"),
        )
    if op == "images.get":
        return db_manager.images.get(int(args["id"]))
    if op == "images.delete":
        return db_manager.images.delete(int(args["id"]))

    if op == "users.findAll":
        return db_manager.users.find_all()
    if op == "users.findById":
        return db_manager.users.find_by_id(int(args["id"]))
    if op == "users.findByUsername":
        return db_manager.users.find_by_username(args["username"])
    if op == "users.canAccessAdmin":
        return db_manager.users.can_access_admin(int(args["id"]))
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
            args.get("featuresJson"),
            args.get("specsJson"),
            args.get("usageNoticeJson"),
            args.get("categoryId"),
            args.get("subCategoryId"),
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
            args.get("featuresJson"),
            args.get("specsJson"),
            args.get("usageNoticeJson"),
            args.get("categoryId"),
            args.get("subCategoryId"),
        )
    if op == "products.delete":
        return db_manager.products.delete(args["id"])

    if op == "productCategories.findAll":
        return db_manager.product_categories.find_all()
    if op == "productCategories.findById":
        return db_manager.product_categories.find_by_id(args["id"])
    if op == "productCategories.create":
        return db_manager.product_categories.create(
            args["name"],
            args.get("nameEn"),
            args.get("slug"),
            args.get("sortOrder", 0),
            args.get("parentId"),
        )
    if op == "productCategories.update":
        return db_manager.product_categories.update(
            args["id"],
            args["name"],
            args.get("nameEn"),
            args.get("slug"),
            args.get("sortOrder", 0),
            args.get("parentId"),
        )
    if op == "productCategories.delete":
        return db_manager.product_categories.delete(args["id"])

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
    if op == "orders.updateTrackingNumber":
        return db_manager.orders.update_tracking_number(args["id"], args.get("trackingNumber"))
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
            float(args.get("txVerifyMaxUnderpayUsdt", 5)),
            int(args.get("txVerifyMaxAgeHours", 2)),
        )

    if op == "chatCommunitySettings.get":
        return db_manager.chat_community_settings.get()
    if op == "chatCommunitySettings.update":
        return db_manager.chat_community_settings.update(
            args.get("telegramGroupUrl", ""),
            args.get("qqGroupUrl", ""),
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

    # Chat operations
    if op == "chatAdmins.findAll":
        return db_manager.chat_admins.find_all()
    if op == "chatAdmins.findById":
        return db_manager.chat_admins.find_by_id(args["id"])
    if op == "chatAdmins.create":
        return db_manager.chat_admins.create(
            args["username"],
            args["display_name"],
            args.get("bio", ""),
            args.get("avatar_color", "#07c160"),
        )
    if op == "chatAdmins.update":
        return db_manager.chat_admins.update(
            args["id"],
            args["display_name"],
            args.get("bio", ""),
            args.get("avatar_color", "#07c160"),
            args.get("telegram_chat_id"),
            args.get("telegram_token"),
            args.get("chatbot_enabled", False),
        )
    if op == "chatAdmins.updateChatbotEnabled":
        return db_manager.chat_admins.update_chatbot_enabled(args["id"], bool(args["enabled"]))
    if op == "chatAdmins.delete":
        return db_manager.chat_admins.delete(args["id"])

    if op == "chatSessions.findAll":
        return db_manager.chat_sessions.find_all()
    if op == "chatSessions.findById":
        return db_manager.chat_sessions.find_by_id(args["id"])
    if op == "chatSessions.findByUserId":
        return db_manager.chat_sessions.find_by_user_id(int(args["user_id"]))
    if op == "chatSessions.findByUserIdAndAdminId":
        return db_manager.chat_sessions.find_by_user_id_and_admin_id(int(args["user_id"]), int(args["admin_id"]))
    if op == "chatSessions.create":
        return db_manager.chat_sessions.create(args["id"], args["nickname"], int(args["admin_id"]), args.get("service_type", "support"), args.get("user_id"))
    if op == "chatSessions.delete":
        return db_manager.chat_sessions.delete(args["id"])
    if op == "chatSessions.findConversationsForAdmin":
        return db_manager.chat_sessions.find_conversations_for_admin()

    if op == "chatMessages.findAll":
        return db_manager.chat_messages.find_all()
    if op == "chatMessages.findById":
        return db_manager.chat_messages.find_by_id(args["id"])
    if op == "chatMessages.findBySessionId":
        return db_manager.chat_messages.find_by_session_id(args["sessionId"], int(args.get("limit", 200)))
    if op == "chatMessages.create":
        return db_manager.chat_messages.create(args["sessionId"], args["sender"], args["body"])
    if op == "chatMessages.delete":
        return db_manager.chat_messages.delete(args["id"])

    if op == "chatTgLinks.create":
        return db_manager.chat_tg_links.create(args["chat_id"], args["tg_message_id"], args["session_id"], args.get("chat_message_id"))
    if op == "chatTgLinks.findByTgMessage":
        return db_manager.chat_tg_links.find_by_tg_message(args["chat_id"], args["tg_message_id"])
    if op == "chatTgLinks.findBySession":
        return db_manager.chat_tg_links.find_by_session(args["session_id"])
    if op == "chatTgLinks.findBySessionAndChatMessage":
        return db_manager.chat_tg_links.find_by_session_and_chat_message(args["session_id"], args["chat_message_id"])
    if op == "chatTgLinks.findLatestUserTgMessage":
        return db_manager.chat_tg_links.find_latest_user_tg_message(args["session_id"])
    if op == "chatTgLinks.deleteBySession":
        return db_manager.chat_tg_links.delete_by_session(args["session_id"])

    if op == "popupNotices.findAll":
        return db_manager.popup_notices.find_all()
    if op == "popupNotices.findById":
        return db_manager.popup_notices.find_by_id(args["id"])
    if op == "popupNotices.findActive":
        return db_manager.popup_notices.find_active()
    if op == "popupNotices.findActiveDisplay":
        return db_manager.popup_notices.find_active_display()
    if op == "popupNotices.create":
        popup_enabled, display_enabled = parse_popup_scope_args(args, default=True)
        return db_manager.popup_notices.create(
            args["title"],
            args["content"],
            popup_enabled,
            display_enabled,
        )
    if op == "popupNotices.update":
        popup_enabled, display_enabled = parse_popup_scope_args(args, default=False)
        return db_manager.popup_notices.update(
            args["id"],
            args["title"],
            args["content"],
            popup_enabled,
            display_enabled,
        )
    if op == "popupNotices.delete":
        return db_manager.popup_notices.delete(args["id"])

    if op == "deviceVerification.getSettings":
        return db_manager.device_verification.get_settings()
    if op == "deviceVerification.updateSettings":
        return db_manager.device_verification.update_verify_cooldown_seconds(
            int(args.get("verify_cooldown_seconds", 0))
        )

    if op == "deviceVerification.findAll":
        return db_manager.device_verification.find_all()
    if op == "deviceVerification.findById":
        return db_manager.device_verification.find_by_id(args["id"])
    if op == "deviceVerification.findByDeviceId":
        return db_manager.device_verification.find_by_device_id(args["device_id"])
    if op == "deviceVerification.create":
        question_id = args.get("question_id")
        firmware_id = args.get("firmware_id")
        is_whitelisted = bool(args.get("is_whitelisted", False))
        return db_manager.device_verification.create(
            args["device_id"],
            int(args.get("max_verifications", 10)),
            question_id if question_id is not None else None,
            firmware_id if firmware_id is not None else None,
            is_whitelisted,
        )
    if op == "deviceVerification.updateMaxVerifications":
        return db_manager.device_verification.update_max_verifications(args["device_id"], int(args["max_verifications"]))
    if op == "deviceVerification.updateQuestionId":
        question_id = args.get("question_id")
        return db_manager.device_verification.update_question_id(
            args["device_id"],
            question_id if question_id is not None else None
        )
    if op == "deviceVerification.updateFirmwareId":
        firmware_id = args.get("firmware_id")
        return db_manager.device_verification.update_firmware_id(
            args["device_id"],
            firmware_id if firmware_id is not None else None
        )
    if op == "deviceVerification.updateWhitelist":
        return db_manager.device_verification.update_whitelist(
            args["device_id"],
            bool(args.get("is_whitelisted", False)),
        )
    if op == "deviceVerification.cleanupUnwhitelistedExpired":
        return db_manager.device_verification.cleanup_unwhitelisted_expired(
            int(args.get("ttl_minutes", 30))
        )
    if op == "deviceVerification.addMaxVerifications":
        return db_manager.device_verification.add_max_verifications(args["device_id"], int(args["add_count"]))
    if op == "deviceVerification.delete":
        return db_manager.device_verification.delete(args["device_id"])
    if op == "deviceVerification.verify":
        return db_manager.device_verification.verify_device(
            args["device_id"],
            args.get("ip_address"),
            args.get("user_agent")
        )
    if op == "deviceVerification.resetCount":
        return db_manager.device_verification.reset_verification_count(args["device_id"])
    if op == "deviceVerification.getPublicKey":
        return db_manager.device_verification.get_public_key(args["device_id"])
    if op == "deviceVerification.getPrivateKey":
        return db_manager.device_verification.get_private_key(args["device_id"])
    if op == "deviceVerification.getKeys":
        return db_manager.device_verification.get_keys(args["device_id"])
    if op == "deviceVerification.verifySignature":
        return db_manager.device_verification.verify_signature(args["device_id"], args["signature"], int(args["issued_at"]))
    if op == "deviceVerification.findLogsByDeviceId":
        return db_manager.device_verification.find_logs_by_device_id(
            args["device_id"],
            int(args.get("limit", 100)),
            int(args.get("offset", 0))
        )
    if op == "deviceVerification.countLogsByDeviceId":
        return db_manager.device_verification.count_logs_by_device_id(args["device_id"])
    if op == "deviceVerification.findAllLogs":
        return db_manager.device_verification.find_all_logs(
            int(args.get("limit", 100)),
            int(args.get("offset", 0))
        )
    if op == "deviceVerification.countAllLogs":
        return db_manager.device_verification.count_all_logs()
    if op == "deviceVerification.listFirmwareFiles":
        return db_manager.device_verification.list_firmware_files()
    if op == "deviceVerification.createFirmwareFile":
        return db_manager.device_verification.create_firmware_file(
            args["file_name"],
            args["file_url"],
            int(args.get("file_size", 0)),
            args.get("checksum_sha256"),
            args.get("remark"),
        )
    if op == "deviceVerification.deleteFirmwareFile":
        return db_manager.device_verification.delete_firmware_file(int(args["id"]))
    if op == "deviceVerification.setDefaultFirmware":
        return db_manager.device_verification.set_default_firmware(int(args["id"]))
    if op == "deviceVerification.updateFirmwareRemark":
        return db_manager.device_verification.update_firmware_remark(int(args["id"]), args.get("remark"))

    if op == "questions.findAll":
        return db_manager.questions.find_all()
    if op == "questions.findById":
        return db_manager.questions.find_by_id(int(args["id"]))
    if op == "questions.create":
        return db_manager.questions.create(
            args["name"],
            args.get("category_name"),
            args.get("db_file_path"),
            args.get("vector_file_path"),
        )
    if op == "questions.update":
        return db_manager.questions.update(
            args["id"],
            args["name"],
            args.get("category_name"),
            args.get("db_file_path"),
            args.get("vector_file_path"),
        )
    if op == "questions.updateFields":
        return db_manager.questions.update_fields(
            args["id"],
            args.get("name"),
            args.get("category_name"),
            args.get("db_file_path"),
            args.get("vector_file_path"),
        )
    if op == "questions.delete":
        from .upload_cleanup import delete_question_with_files
        delete_question_with_files(db_manager, int(args["id"]))
        return {"ok": True}

    raise ValueError(f"Unknown op: {op}")
