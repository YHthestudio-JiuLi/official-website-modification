"""users.can_access_admin 与 Laravel User::canAccessAdmin 对齐测试"""
from __future__ import annotations

import sqlite3
import unittest
from unittest.mock import patch

from py_backend.modules.users import UserManager


class TestCanAccessAdmin(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = sqlite3.connect(':memory:')
        self.conn.row_factory = sqlite3.Row
        self.conn.execute(
            """
            CREATE TABLE users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL,
              email TEXT UNIQUE NOT NULL,
              password TEXT NOT NULL,
              isAdmin INTEGER DEFAULT 0,
              user_type TEXT
            )
            """
        )
        self.users = UserManager(self.conn)
        self.customer_id = self.users.create('cust', 'cust@example.com', 'hash', 0)

    def test_pure_customer_denied_even_with_legacy_is_admin(self) -> None:
        self.conn.execute('UPDATE users SET isAdmin = 1 WHERE id = ?', (self.customer_id,))
        with patch.object(self.users, '_role_names', return_value={'customer'}):
            self.assertFalse(self.users.can_access_admin(self.customer_id))

    def test_agent_with_admin_access_allowed(self) -> None:
        agent_id = self.users.create('agent', 'agent@example.com', 'hash', 0)
        with patch.object(self.users, '_has_admin_access_permission', return_value=True):
            with patch.object(self.users, '_role_names', return_value={'agent'}):
                self.assertTrue(self.users.can_access_admin(agent_id))

    def test_legacy_super_admin_without_roles_allowed(self) -> None:
        admin_id = self.users.create('legacy', 'legacy@example.com', 'hash', 1)
        with patch.object(self.users, '_role_names', return_value=set()):
            self.assertTrue(self.users.can_access_admin(admin_id))


if __name__ == '__main__':
    unittest.main()
