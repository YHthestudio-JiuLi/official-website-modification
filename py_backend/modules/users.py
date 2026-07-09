from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..utils import DEFAULT_ADMIN_BCRYPT_HASH, row_to_dict, rows_to_dict


class UserManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = conn.cursor()

    def create_table(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              username VARCHAR(255) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              password TEXT NOT NULL,
              isAdmin TINYINT DEFAULT 0,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              KEY idx_users_username (username),
              KEY idx_users_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )

    def find_all(self) -> List[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users ORDER BY createdAt DESC")
        return rows_to_dict(self.cur.fetchall())

    def find_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return row_to_dict(self.cur.fetchone())

    def find_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE username = ?", (username,))
        return row_to_dict(self.cur.fetchone())

    def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        self.cur.execute("SELECT * FROM users WHERE email = ?", (email,))
        return row_to_dict(self.cur.fetchone())

    def can_access_admin(self, user_id: int) -> bool:
        """与 Laravel User::canAccessAdmin 对齐：super_admin 或 admin.access，纯 customer 拒绝"""
        user = self.find_by_id(user_id)
        if not user:
            return False
        if self._is_super_admin(user):
            return True
        role_names = self._role_names(user_id)
        # 与 Laravel：仅有 customer 且无 staff/agent/super_admin 时拒绝
        if "customer" in role_names and not (role_names & {"super_admin", "staff", "agent"}):
            return False
        return self._has_admin_access_permission(user_id)

    def _has_admin_access_permission(self, user_id: int) -> bool:
        model_type = "App\\Models\\User"
        guard = "web"
        self.cur.execute(
            """
            SELECT 1 FROM permissions p
            INNER JOIN model_has_permissions mhp ON mhp.permission_id = p.id
            WHERE mhp.model_type = ? AND mhp.model_id = ?
              AND p.name = 'admin.access' AND p.guard_name = ?
            LIMIT 1
            """,
            (model_type, user_id, guard),
        )
        if self.cur.fetchone():
            return True

        self.cur.execute(
            """
            SELECT 1 FROM permissions p
            INNER JOIN role_has_permissions rhp ON rhp.permission_id = p.id
            INNER JOIN model_has_roles mhr ON mhr.role_id = rhp.role_id
            INNER JOIN roles r ON r.id = mhr.role_id
            WHERE mhr.model_type = ? AND mhr.model_id = ?
              AND p.name = 'admin.access' AND p.guard_name = ? AND r.guard_name = ?
            LIMIT 1
            """,
            (model_type, user_id, guard, guard),
        )
        return self.cur.fetchone() is not None

    def _role_names(self, user_id: int) -> set[str]:
        model_type = "App\\Models\\User"
        self.cur.execute(
            """
            SELECT r.name FROM roles r
            INNER JOIN model_has_roles mhr ON mhr.role_id = r.id
            WHERE mhr.model_type = ? AND mhr.model_id = ? AND r.guard_name = 'web'
            """,
            (model_type, user_id),
        )
        return {str(row[0]) for row in self.cur.fetchall()}

    def _is_super_admin(self, user: Dict[str, Any]) -> bool:
        user_id = int(user.get("id") or 0)
        if user_id <= 0:
            return False
        role_names = self._role_names(user_id)
        if "super_admin" in role_names:
            return True
        if str(user.get("user_type") or "").lower() == "super_admin":
            return True
        # 历史账号仅 isAdmin=1、尚未挂 Spatie 角色时仍视为超管（与 Laravel User::isSuperAdmin 对齐）
        if user.get("isAdmin") in (1, True, "1") and not role_names:
            return True
        return False

    def is_scoped_agent(self, user_id: int) -> bool:
        """与 Laravel AgentDataScope::isScopedAgent 对齐"""
        user = self.find_by_id(user_id)
        if not user:
            return False
        if self._is_super_admin(user):
            return False
        if str(user.get("user_type") or "").lower() == "agent":
            return True
        return "agent" in self._role_names(user_id)

    def create(self, username: str, email: str, password: str, is_admin: int = 0) -> int:
        self.cur.execute(
            "INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)",
            (username, email, password, is_admin),
        )
        self.conn.commit()
        return int(self.cur.lastrowid)

    def update(self, user_id: int, email: str, password: Optional[str], is_admin: int) -> None:
        if password:
            self.cur.execute(
                "UPDATE users SET email = ?, password = ?, isAdmin = ? WHERE id = ?",
                (email, password, is_admin, user_id),
            )
        else:
            self.cur.execute(
                "UPDATE users SET email = ?, isAdmin = ? WHERE id = ?",
                (email, is_admin, user_id),
            )
        self.conn.commit()

    def delete(self, user_id: int) -> None:
        self.cur.execute("DELETE FROM users WHERE id = ? AND isAdmin = 0", (user_id,))
        self.conn.commit()

    def seed_default_admin(self) -> None:
        self.cur.execute("SELECT id FROM users WHERE username = ?", ("admin",))
        if self.cur.fetchone() is None:
            self.cur.execute(
                "INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)",
                ("admin", "admin@yhthestudio.com", DEFAULT_ADMIN_BCRYPT_HASH, 1),
            )
            self.conn.commit()
