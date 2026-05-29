from __future__ import annotations

from typing import List

from .users import UserManager
from .images import ImageManager
from .products import ProductManager
from .product_categories import ProductCategoryManager
from .orders import OrderManager
from .forum_posts import ForumPostManager
from .forum_replies import ForumReplyManager
from .contact_messages import ContactMessageManager
from .payment_settings import PaymentSettingsManager
from .chat_community_settings import ChatCommunitySettingsManager
from .cart import CartManager
from .chat_admins import ChatAdminManager
from .chat_sessions import ChatSessionManager
from .chat_messages import ChatMessageManager
from .chat_tg_links import ChatTgLinkManager
from .popup_notices import PopupNoticeManager
from .device_verification import DeviceVerificationManager
from .questions import QuestionManager


class DatabaseManager:
    def __init__(self, conn):
        self.conn = conn
        self.users = UserManager(conn)
        self.images = ImageManager(conn)
        self.products = ProductManager(conn)
        self.product_categories = ProductCategoryManager(conn)
        self.orders = OrderManager(conn)
        self.forum_posts = ForumPostManager(conn)
        self.forum_replies = ForumReplyManager(conn)
        self.contact_messages = ContactMessageManager(conn)
        self.payment_settings = PaymentSettingsManager(conn)
        self.chat_community_settings = ChatCommunitySettingsManager(conn)
        self.cart = CartManager(conn)
        self.chat_admins = ChatAdminManager(conn)
        self.chat_sessions = ChatSessionManager(conn)
        self.chat_messages = ChatMessageManager(conn)
        self.chat_tg_links = ChatTgLinkManager(conn)
        self.popup_notices = PopupNoticeManager(conn)
        self.device_verification = DeviceVerificationManager(conn)
        self.questions = QuestionManager(conn)

    def init_db(self) -> None:
        self.images.create_table()
        self.users.create_table()
        self.products.create_table()
        self.product_categories.create_table()
        self.orders.create_table()
        self.forum_posts.create_table()
        self.forum_replies.create_table()
        self.contact_messages.create_table()
        self.payment_settings.create_table()
        self.chat_community_settings.create_table()
        self.cart.create_table()
        self.chat_admins.create_table()
        self.chat_sessions.create_table()
        self.chat_messages.create_table()
        self.chat_tg_links.create_table()
        self.popup_notices.create_table()
        self.device_verification.create_table()
        self.questions.create_table()

        self.users.seed_default_admin()
        self.products.seed_sample_data()
        self.product_categories.seed_defaults()
        self.forum_posts.seed_sample_data()
        self.payment_settings.seed_default()
        self.chat_admins.init_default_admins()

        self.conn.commit()
