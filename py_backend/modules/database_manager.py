from __future__ import annotations

import sqlite3
from typing import List

from .users import UserManager
from .products import ProductManager
from .orders import OrderManager
from .forum_posts import ForumPostManager
from .forum_replies import ForumReplyManager
from .contact_messages import ContactMessageManager
from .payment_settings import PaymentSettingsManager
from .cart import CartManager
from .chat_admins import ChatAdminManager
from .chat_sessions import ChatSessionManager
from .chat_messages import ChatMessageManager
from .chat_tg_links import ChatTgLinkManager
from .popup_notices import PopupNoticeManager


class DatabaseManager:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.users = UserManager(conn)
        self.products = ProductManager(conn)
        self.orders = OrderManager(conn)
        self.forum_posts = ForumPostManager(conn)
        self.forum_replies = ForumReplyManager(conn)
        self.contact_messages = ContactMessageManager(conn)
        self.payment_settings = PaymentSettingsManager(conn)
        self.cart = CartManager(conn)
        self.chat_admins = ChatAdminManager(conn)
        self.chat_sessions = ChatSessionManager(conn)
        self.chat_messages = ChatMessageManager(conn)
        self.chat_tg_links = ChatTgLinkManager(conn)
        self.popup_notices = PopupNoticeManager(conn)

    def init_db(self) -> None:
        self.conn.execute("PRAGMA foreign_keys = ON")
        
        self.users.create_table()
        self.products.create_table()
        self.orders.create_table()
        self.forum_posts.create_table()
        self.forum_replies.create_table()
        self.contact_messages.create_table()
        self.payment_settings.create_table()
        self.cart.create_table()
        self.chat_admins.create_table()
        self.chat_sessions.create_table()
        self.chat_messages.create_table()
        self.chat_tg_links.create_table()
        self.popup_notices.create_table()

        self._apply_pragmas()

        self.users.seed_default_admin()
        self.products.seed_sample_data()
        self.forum_posts.seed_sample_data()
        self.payment_settings.seed_default()
        self.chat_admins.init_default_admins()

        self.conn.commit()

    def _apply_pragmas(self) -> None:
        statements = [
            "PRAGMA journal_mode = WAL",
            "PRAGMA synchronous = NORMAL",
            "PRAGMA cache_size = -64000",
            "PRAGMA temp_store = MEMORY",
        ]
        cur = self.conn.cursor()
        for stmt in statements:
            try:
                cur.execute(stmt)
            except sqlite3.OperationalError:
                pass
