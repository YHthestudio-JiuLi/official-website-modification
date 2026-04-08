"""
超时未支付订单清理：delete_expired_pending 与 createdAt 解析
"""
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from py_backend.modules.orders import OrderManager, _parse_order_created_at


class TestOrdersExpiredPending(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp()
        cls.db_path = os.path.join(cls.temp_dir, "orders_cleanup.db")
        cls.conn = sqlite3.connect(cls.db_path)
        cls.conn.row_factory = sqlite3.Row
        cls.mgr = OrderManager(cls.conn)
        cls.mgr.create_table()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        import shutil

        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        self.conn.execute("DELETE FROM orders")
        self.conn.commit()

    def test_parse_iso_z_with_fraction(self):
        s = "2026-01-01T12:00:00.123456Z"
        dt = _parse_order_created_at(s)
        self.assertIsNotNone(dt)
        self.assertEqual(dt.tzinfo, timezone.utc)

    def test_delete_expired_pending_respects_minutes(self):
        old = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        recent = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
        self.conn.execute(
            """
            INSERT INTO orders (
              userId, username, productId, productName, quantity, price, totalAmount,
              status, createdAt
            ) VALUES (1, 'u', 1, 'p', 1, 1.0, 1.0, 'pending', ?)
            """,
            (old,),
        )
        self.conn.execute(
            """
            INSERT INTO orders (
              userId, username, productId, productName, quantity, price, totalAmount,
              status, createdAt
            ) VALUES (1, 'u', 1, 'p', 1, 1.0, 1.0, 'pending', ?)
            """,
            (recent,),
        )
        self.conn.commit()
        deleted = self.mgr.delete_expired_pending(60)
        self.assertEqual(deleted, 1)
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'")
        self.assertEqual(int(cur.fetchone()["c"]), 1)


if __name__ == "__main__":
    unittest.main()
