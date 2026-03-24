from __future__ import annotations

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
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
              body TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
            )
            """
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)"
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
            if session_id not in _message_cache:
                _message_cache[session_id] = []
            result = _message_cache[session_id][-limit:]
            logging.getLogger("py_backend").info(f"[ChatMessages] Returning {len(result)} messages for session {session_id}")
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
            
        msg_id = int(time.time() * 1000)
        created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        
        new_msg = {
            "id": msg_id,
            "session_id": session_id,
            "sender": sender,
            "body": text[:4000],
            "created_at": created_at
        }
        
        with _cache_lock:
            if session_id not in _message_cache:
                _message_cache[session_id] = []
            _message_cache[session_id].append(new_msg)
            logging.getLogger("py_backend").info(f"[ChatMessages] Created message for session {session_id}, total messages: {len(_message_cache[session_id])}")
        
        return new_msg

    def delete(self, message_id: int) -> None:
        with _cache_lock:
            for sid in list(_message_cache.keys()):
                for i, msg in enumerate(_message_cache[sid]):
                    if msg["id"] == message_id:
                        _message_cache[sid].pop(i)
                        return

    def cleanup_expired(self, hours: int = 3) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        try:
            with _cache_lock:
                for sid in list(_message_cache.keys()):
                    valid_msgs = []
                    for msg in _message_cache[sid]:
                        try:
                            msg_time = datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00"))
                            if msg_time >= cutoff:
                                valid_msgs.append(msg)
                        except Exception:
                            valid_msgs.append(msg)
                    
                    if valid_msgs:
                        _message_cache[sid] = valid_msgs
                    else:
                        del _message_cache[sid]
                        
                logging.getLogger("py_backend").info(f"Cleaned up memory cache for messages older than {hours} hours. Active sessions: {len(_message_cache)}")
        except Exception as e:
            logging.getLogger("py_backend").error(f"Error during chat memory cleanup: {e}")
