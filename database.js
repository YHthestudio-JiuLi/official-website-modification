const PY_DB_URL = process.env.PY_DB_URL || 'http://127.0.0.1:5100';

async function rpc(op, args = {}) {
  const res = await fetch(`${PY_DB_URL}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, args })
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {
    // ignore
  }

  if (!res.ok) {
    const detail = payload && (payload.detail || payload.error || payload.message);
    throw new Error(detail || `Python DB backend error (${res.status})`);
  }

  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'Python DB backend returned invalid payload');
  }

  return payload.result;
}

const dbOperations = {
  users: {
    findAll: () => rpc('users.findAll'),
    findById: (id) => rpc('users.findById', { id }),
    findByUsername: (username) => rpc('users.findByUsername', { username }),
    findByEmail: (email) => rpc('users.findByEmail', { email }),
    create: (username, email, password, isAdmin = 0) =>
      rpc('users.create', { username, email, password, isAdmin }),
    update: (id, email, password, isAdmin) =>
      rpc('users.update', { id, email, password, isAdmin }),
    delete: (id) => rpc('users.delete', { id })
  },
  products: {
    findAll: () => rpc('products.findAll'),
    findById: (id) => rpc('products.findById', { id }),
    create: (name, description, image, date, price, priceUsdt) =>
      rpc('products.create', { name, description, image, date, price, priceUsdt }),
    update: (id, name, description, image, date, price, priceUsdt) =>
      rpc('products.update', { id, name, description, image, date, price, priceUsdt }),
    delete: (id) => rpc('products.delete', { id })
  },
  orders: {
    findAll: (statusFilter = '') => rpc('orders.findAll', { statusFilter }),
    findById: (id) => rpc('orders.findById', { id }),
    findByUserId: (userId) => rpc('orders.findByUserId', { userId }),
    create: (orderData) => rpc('orders.create', { orderData }),
    updateStatus: (id, status) => rpc('orders.updateStatus', { id, status }),
    updateTxHash: (id, txHash) => rpc('orders.updateTxHash', { id, txHash }),
    updateShippingAddress: (id, shippingAddress) => rpc('orders.updateShippingAddress', { id, shippingAddress }),
    getStats: () => rpc('orders.getStats'),
    delete: (id) => rpc('orders.delete', { id }),
    deleteExpiredPending: (minutes) => rpc('orders.deleteExpiredPending', { minutes })
  },
  forumPosts: {
    findAll: () => rpc('forumPosts.findAll'),
    findById: (id) => rpc('forumPosts.findById', { id }),
    create: (title, author, content, date, replies = 0) =>
      rpc('forumPosts.create', { title, author, content, date, replies }),
    update: (id, title, author, content, date, replies) =>
      rpc('forumPosts.update', { id, title, author, content, date, replies }),
    togglePin: (id) => rpc('forumPosts.togglePin', { id }),
    delete: (id) => rpc('forumPosts.delete', { id }),
    incrementReplies: (id) => rpc('forumPosts.incrementReplies', { id })
  },
  forumReplies: {
    findByPostId: (postId) => rpc('forumReplies.findByPostId', { postId }),
    findById: (id) => rpc('forumReplies.findById', { id }),
    create: (postId, author, content, parentReplyId = null) =>
      rpc('forumReplies.create', { postId, author, content, parentReplyId }),
    delete: (id) => rpc('forumReplies.delete', { id })
  },
  paymentSettings: {
    get: () => rpc('paymentSettings.get'),
    update: (walletAddress, network = 'TRC20', autoDeleteMinutes = 30) =>
      rpc('paymentSettings.update', { walletAddress, network, autoDeleteMinutes })
  },
  cart: {
    get: (userId) => rpc('cart.get', { userId }),
    addItem: (userId, productId, quantity = 1) =>
      rpc('cart.addItem', { userId, productId, quantity }),
    updateQuantity: (userId, productId, quantity) =>
      rpc('cart.updateQuantity', { userId, productId, quantity }),
    removeItem: (userId, productId) =>
      rpc('cart.removeItem', { userId, productId }),
    clear: (userId) => rpc('cart.clear', { userId })
  },
  chatAdmins: {
    findAll: () => rpc('chatAdmins.findAll'),
    findById: (id) => rpc('chatAdmins.findById', { id }),
    create: (username, displayName, bio = '', avatarColor = '#07c160') =>
      rpc('chatAdmins.create', { username, display_name: displayName, bio, avatar_color: avatarColor }),
    update: (id, displayName, bio = '', avatarColor = '#07c160', telegramChatId = null, telegramToken = null, chatbotEnabled = false) =>
      rpc('chatAdmins.update', { id, display_name: displayName, bio, avatar_color: avatarColor, telegram_chat_id: telegramChatId, telegram_token: telegramToken, chatbot_enabled: chatbotEnabled }),
    updateChatbotEnabled: (id, enabled) =>
      rpc('chatAdmins.updateChatbotEnabled', { id, enabled }),
    delete: (id) => rpc('chatAdmins.delete', { id })
  },
  chatSessions: {
    findAll: () => rpc('chatSessions.findAll'),
    findById: (id) => rpc('chatSessions.findById', { id }),
    findByUserId: (userId) => rpc('chatSessions.findByUserId', { user_id: userId }),
    findByUserIdAndAdminId: (userId, adminId) => rpc('chatSessions.findByUserIdAndAdminId', { user_id: userId, admin_id: adminId }),
    findConversationsForAdmin: () => rpc('chatSessions.findConversationsForAdmin'),
    create: (id, nickname, adminId, serviceType = 'support', userId = null) =>
      rpc('chatSessions.create', { id, nickname, admin_id: adminId, service_type: serviceType, user_id: userId }),
    delete: (id) => rpc('chatSessions.delete', { id }),
  },
  chatMessages: {
    findAll: () => rpc('chatMessages.findAll'),
    findById: (id) => rpc('chatMessages.findById', { id }),
    findBySessionId: (sessionId, limit = 200) =>
      rpc('chatMessages.findBySessionId', { sessionId, limit }),
    create: (sessionId, sender, body) =>
      rpc('chatMessages.create', { sessionId, sender, body }),
    delete: (id) => rpc('chatMessages.delete', { id })
  },
  chatTgLinks: {
    create: (chatId, tgMessageId, sessionId, chatMessageId = null) =>
      rpc('chatTgLinks.create', { chat_id: chatId, tg_message_id: tgMessageId, session_id: sessionId, chat_message_id: chatMessageId }),
    findByTgMessage: (chatId, tgMessageId) =>
      rpc('chatTgLinks.findByTgMessage', { chat_id: chatId, tg_message_id: tgMessageId }),
    findBySession: (sessionId) =>
      rpc('chatTgLinks.findBySession', { session_id: sessionId }),
    findBySessionAndChatMessage: (sessionId, chatMessageId) =>
      rpc('chatTgLinks.findBySessionAndChatMessage', { session_id: sessionId, chat_message_id: chatMessageId }),
    findLatestUserTgMessage: (sessionId) =>
      rpc('chatTgLinks.findLatestUserTgMessage', { session_id: sessionId }),
    deleteBySession: (sessionId) =>
      rpc('chatTgLinks.deleteBySession', { session_id: sessionId })
  },
  popupNotices: {
    findAll: () => rpc('popupNotices.findAll'),
    findById: (id) => rpc('popupNotices.findById', { id }),
    findActive: () => rpc('popupNotices.findActive'),
    create: (title, content, enabled = true) =>
      rpc('popupNotices.create', { title, content, enabled }),
    update: (id, title, content, enabled = true) =>
      rpc('popupNotices.update', { id, title, content, enabled }),
    delete: (id) => rpc('popupNotices.delete', { id })
  }
};

module.exports = { db: null, dbOperations };
