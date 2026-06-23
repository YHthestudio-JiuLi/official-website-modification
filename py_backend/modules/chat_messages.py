from __future__ import annotations

import random
import sqlite3
import time
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import logging

# 全局消息缓存，使用线程锁保护
_message_cache: Dict[str, List[Dict[str, Any]]] = {}
_cache_lock = threading.Lock()


def get_cache() -> Dict[str, List[Dict[str, Any]]]:
    return _message_cache


class ChatMessageManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        # id 由应用层用毫秒时间戳显式写入（非自增）
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id BIGINT PRIMARY KEY,
              session_id VARCHAR(64) NOT NULL,
              sender VARCHAR(16) NOT NULL,
              body TEXT NOT NULL,
              created_at VARCHAR(40) NOT NULL,
              KEY idx_chat_messages_session (session_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        with _cache_lock:
            all_msgs = []
            for msgs in _message_cache.values():
                all_msgs.extend(msgs)
            return sorted(all_msgs, key=lambda x: x["created_at"])

    def find_by_id(self, message_id: int) -> Optional[Dict[str, Any]]:
        with _cache_lock:
            for msgs in _message_cache.values():
                for msg in msgs:
                    if msg["id"] == message_id:
                        return msg
            return None

    def find_by_session_id(self, session_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        with _cache_lock:
            logging.getLogger("py_backend").info(f"[ChatMessages] find_by_session_id called: {session_id}, cache keys: {list(_message_cache.keys())}")
            cached = _message_cache.get(session_id)
            if cached and len(cached) > 0:
                result = cached[-limit:]
                logging.getLogger("py_backend").info(f"[ChatMessages] Returning {len(result)} messages for session {session_id} (cache)")
                return result

        # 内存为空时从 SQLite 加载，避免侧边栏有预览、详情页空白
        self.cur.execute(
            """
            SELECT id, session_id, sender, body, created_at
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY id ASC
            """,
            (session_id,),
        )
        rows = self.cur.fetchall()
        loaded: List[Dict[str, Any]] = [
            {
                "id": int(r["id"]),
                "session_id": r["session_id"],
                "sender": r["sender"],
                "body": r["body"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
        with _cache_lock:
            _message_cache[session_id] = loaded
        result = loaded[-limit:]
        logging.getLogger("py_backend").info(f"[ChatMessages] Returning {len(result)} messages for session {session_id} (sqlite)")
        return result

    def create(self, session_id: str, sender: str, body: str) -> Optional[Dict[str, Any]]:
        text = body.strip()
        if not text:
            return None
        session_exists = self.cur.execute(
            "SELECT 1 FROM chat_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session_exists:
            logging.getLogger("py_backend").warning(f"[ChatMessages] Session not found: {session_id}")
            return None
            
        msg_id = self._generate_message_id()
        created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        
        new_msg = {
            "id": msg_id,
            "session_id": session_id,
            "sender": sender,
            "body": text[:4000],
            "created_at": created_at
        }

        # 与侧边栏会话列表一致：同时写入 SQLite（仅内存会导致预览与详情不一致）
        try:
            self.cur.execute(
                """
                INSERT INTO chat_messages (id, session_id, sender, body, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (msg_id, session_id, sender, text[:4000], created_at),
            )
            self.conn.commit()
        except Exception as e:
            logging.getLogger("py_backend").error(f"[ChatMessages] SQLite 写入失败: {e}")
            return None

        with _cache_lock:
            if session_id not in _message_cache:
                _message_cache[session_id] = []
            _message_cache[session_id].append(new_msg)
            logging.getLogger("py_backend").info(f"[ChatMessages] Created message for session {session_id}, total messages: {len(_message_cache[session_id])}")

        return new_msg

    def _generate_message_id(self) -> int:
        """生成唯一消息 ID，避免同一毫秒内多条 TG 回复冲突导致写入失败"""
        for _ in range(12):
            candidate = int(time.time() * 1000) * 1000 + random.randint(0, 999)
            exists = self.cur.execute(
                "SELECT 1 FROM chat_messages WHERE id = ?",
                (candidate,),
            ).fetchone()
            if not exists:
                return candidate
            time.sleep(0.001)
        return int(time.time() * 1000000)

    def delete(self, message_id: int) -> None:
        with _cache_lock:
            for sid in list(_message_cache.keys()):
                for i, msg in enumerate(_message_cache[sid]):
                    if msg["id"] == message_id:
                        _message_cache[sid].pop(i)
                        return

    def cleanup_expired(self, hours: int = 3) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        def _parse_ts(raw: str) -> Optional[datetime]:
            try:
                s = str(raw).strip().replace("Z", "+00:00")
                dt = datetime.fromisoformat(s)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                return None

        try:
            # 先删 SQLite 里过期消息（否则后台列表仍显示旧预览，内存却已被清空）
            self.cur.execute("SELECT id, created_at FROM chat_messages")
            old_ids: List[int] = []
            for row in self.cur.fetchall():
                mt = _parse_ts(row["created_at"])
                if mt is not None and mt < cutoff:
                    old_ids.append(int(row["id"]))
            for oid in old_ids:
                self.cur.execute("DELETE FROM chat_messages WHERE id = ?", (oid,))
            self.conn.commit()
            if old_ids:
                logging.getLogger("py_backend").info(f"[ChatMessages] SQLite 删除过期消息 {len(old_ids)} 条（>{hours}h）")

            with _cache_lock:
                for sid in list(_message_cache.keys()):
                    valid_msgs = []
                    for msg in _message_cache[sid]:
                        mt = _parse_ts(msg.get("created_at", ""))
                        if mt is None or mt >= cutoff:
                            valid_msgs.append(msg)

                    if valid_msgs:
                        _message_cache[sid] = valid_msgs
                    else:
                        del _message_cache[sid]

                logging.getLogger("py_backend").info(
                    f"Cleaned up chat messages older than {hours} hours. Memory sessions: {len(_message_cache)}"
                )
        except Exception as e:
            logging.getLogger("py_backend").error(f"Error during chat cleanup: {e}")
