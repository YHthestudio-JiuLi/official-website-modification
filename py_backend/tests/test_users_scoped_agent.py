"""users.is_scoped_agent 与 Laravel AgentDataScope 对齐测试"""
from __future__ import annotations

import sqlite3
import unittest
from unittest.mock import patch

from py_backend.modules.users import UserManager


class TestIsScopedAgent(unittest.TestCase):
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
        self.user_id = self.users.create('agent_user', 'agent@example.com', 'hash', 0)

    def test_agent_role_is_scoped(self) -> None:
        with patch.object(self.users, '_role_names', return_value={'agent'}):
            self.assertTrue(self.users.is_scoped_agent(self.user_id))

    def test_super_admin_is_not_scoped(self) -> None:
        with patch.object(self.users, '_role_names', return_value={'super_admin'}):
            self.assertFalse(self.users.is_scoped_agent(self.user_id))

    def test_legacy_is_admin_without_roles_is_not_scoped_as_agent(self) -> None:
        admin_id = self.users.create('legacy_admin', 'admin@example.com', 'hash', 1)
        with patch.object(self.users, '_role_names', return_value=set()):
            self.assertFalse(self.users.is_scoped_agent(admin_id))

    def test_role_names_reads_dict_cursor_rows(self) -> None:
        """MySQL DictCursor 返回 dict，不能用 row[0]"""
        with patch.object(self.users.cur, 'fetchall', return_value=[{'name': 'agent'}]):
            with patch.object(self.users.cur, 'execute'):
                self.assertEqual(self.users._role_names(self.user_id), {'agent'})


if __name__ == '__main__':
    unittest.main()
