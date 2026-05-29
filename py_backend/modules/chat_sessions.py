from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional


class ChatSessionManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
              id VARCHAR(64) PRIMARY KEY,
              nickname VARCHAR(255) NOT NULL,
              admin_id INT NOT NULL,
              user_id INT,
              service_type VARCHAR(32) DEFAULT 'support',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_chat_sessions_admin (admin_id),
              KEY idx_chat_sessions_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT s.id, s.nickname, s.admin_id, s.user_id, s.service_type, s.created_at,
                   a.display_name AS admin_display_name, a.avatar_color AS admin_avatar_color
            FROM chat_sessions s
            JOIN chat_admins a ON a.id = s.admin_id
            ORDER BY s.created_at DESC
            """
        )
        return [dict(row) for row in self.cur.fetchall()]

    def find_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT s.id, s.nickname, s.admin_id, s.user_id, s.service_type, s.created_at,
                   a.display_name AS admin_display_name, a.avatar_color AS admin_avatar_color
            FROM chat_sessions s
            JOIN chat_admins a ON a.id = s.admin_id
            WHERE s.id = ?
            """,
            (session_id,),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def find_by_user_id(self, user_id: int) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT s.id, s.nickname, s.admin_id, s.user_id, s.service_type, s.created_at,
                   a.display_name AS admin_display_name, a.avatar_color AS admin_avatar_color
            FROM chat_sessions s
            JOIN chat_admins a ON a.id = s.admin_id
            WHERE s.user_id = ?
            ORDER BY s.created_at DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in self.cur.fetchall()]

    def find_by_user_id_and_admin_id(self, user_id: int, admin_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT s.id, s.nickname, s.admin_id, s.user_id, s.service_type, s.created_at,
                   a.display_name AS admin_display_name, a.avatar_color AS admin_avatar_color
            FROM chat_sessions s
            JOIN chat_admins a ON a.id = s.admin_id
            WHERE s.user_id = ? AND s.admin_id = ?
            ORDER BY s.created_at DESC
            LIMIT 1
            """,
            (user_id, admin_id),
        )
        row = self.cur.fetchone()
        return dict(row) if row else None

    def create(self, session_id: str, nickname: str, admin_id: int, service_type: str = 'support', user_id: int = None) -> Optional[Dict[str, Any]]:
        # Check if admin exists
        self.cur.execute("SELECT id FROM chat_admins WHERE id = ?", (admin_id,))
        admin_exists = self.cur.fetchone()
        if not admin_exists:
            return None
        self.cur.execute(
            "INSERT INTO chat_sessions (id, nickname, admin_id, user_id, service_type) VALUES (?, ?, ?, ?, ?)",
            (session_id, nickname.strip()[:32], admin_id, user_id, service_type),
        )
        self.conn.commit()
        return self.find_by_id(session_id)

    def delete(self, session_id: str) -> None:
        self.cur.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        self.conn.commit()

    def find_conversations_for_admin(self) -> List[Dict[str, Any]]:
        self.cur.execute(
            """
            SELECT s.id AS session_id, s.nickname, s.admin_id, s.user_id, s.service_type, s.created_at,
                   a.display_name AS admin_display_name,
                   a.avatar_color AS admin_avatar_color,
                   lm.last_body,
                   lm.last_at,
                   lm.last_sender
            FROM chat_sessions s
            JOIN chat_admins a ON a.id = s.admin_id
            JOIN (
              SELECT m1.session_id,
                     m1.body AS last_body,
                     m1.created_at AS last_at,
                     m1.sender AS last_sender
              FROM chat_messages m1
              JOIN (
                SELECT session_id, MAX(id) AS max_id
                FROM chat_messages
                GROUP BY session_id
              ) x ON x.session_id = m1.session_id AND x.max_id = m1.id
            ) lm ON lm.session_id = s.id
            ORDER BY lm.last_at DESC
            """
        )
        return [dict(row) for row in self.cur.fetchall()]
