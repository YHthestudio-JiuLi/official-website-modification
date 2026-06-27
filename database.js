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
  images: {
    // 图片以 BLOB 存于 MySQL，Node 端用 base64 在 RPC 间传输
    create: (dataBase64, mime, filename) => rpc('images.create', { dataBase64, mime, filename }),
    get: (id) => rpc('images.get', { id }),
    delete: (id) => rpc('images.delete', { id })
  },
  users: {
    findAll: () => rpc('users.findAll'),
    findById: (id) => rpc('users.findById', { id }),
    findByUsername: (username) => rpc('users.findByUsername', { username }),
    canAccessAdmin: (id) => rpc('users.canAccessAdmin', { id }),
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
    create: (name, description, image, date, price, priceUsdt, featuresJson, specsJson, usageNoticeJson, configsJson, categoryId, subCategoryId) =>
      rpc('products.create', { name, description, image, date, price, priceUsdt, featuresJson, specsJson, usageNoticeJson, configsJson, categoryId, subCategoryId }),
    update: (id, name, description, image, date, price, priceUsdt, featuresJson, specsJson, usageNoticeJson, configsJson, categoryId, subCategoryId) =>
      rpc('products.update', { id, name, description, image, date, price, priceUsdt, featuresJson, specsJson, usageNoticeJson, configsJson, categoryId, subCategoryId }),
    delete: (id) => rpc('products.delete', { id })
  },
  productCategories: {
    findAll: () => rpc('productCategories.findAll'),
    findById: (id) => rpc('productCategories.findById', { id }),
    create: (name, nameEn, slug, sortOrder, parentId) =>
      rpc('productCategories.create', { name, nameEn, slug, sortOrder, parentId }),
    update: (id, name, nameEn, slug, sortOrder, parentId) =>
      rpc('productCategories.update', { id, name, nameEn, slug, sortOrder, parentId }),
    delete: (id) => rpc('productCategories.delete', { id })
  },
  orders: {
    findAll: (statusFilter = '') => rpc('orders.findAll', { statusFilter }),
    findById: (id) => rpc('orders.findById', { id }),
    findByUserId: (userId) => rpc('orders.findByUserId', { userId }),
    create: (orderData) => rpc('orders.create', { orderData }),
    updateStatus: (id, status) => rpc('orders.updateStatus', { id, status }),
    updateTxHash: (id, txHash) => rpc('orders.updateTxHash', { id, txHash }),
    updateShippingAddress: (id, shippingAddress) => rpc('orders.updateShippingAddress', { id, shippingAddress }),
    updateTrackingNumber: (id, trackingNumber) => rpc('orders.updateTrackingNumber', { id, trackingNumber }),
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
    update: (
      walletAddress,
      network = 'TRC20',
      autoDeleteMinutes = 30,
      txVerifyMaxUnderpayUsdt = 5,
      txVerifyMaxAgeHours = 2
    ) =>
      rpc('paymentSettings.update', {
        walletAddress,
        network,
        autoDeleteMinutes,
        txVerifyMaxUnderpayUsdt,
        txVerifyMaxAgeHours
      })
  },
  chatCommunitySettings: {
    get: () => rpc('chatCommunitySettings.get'),
    update: (telegramGroupUrl, qqGroupUrl) =>
      rpc('chatCommunitySettings.update', { telegramGroupUrl, qqGroupUrl })
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
    findActiveDisplay: () => rpc('popupNotices.findActiveDisplay'),
    create: (title, content, popupEnabled = true, displayEnabled = true) =>
      rpc('popupNotices.create', {
        title,
        content,
        popup_enabled: popupEnabled,
        display_enabled: displayEnabled
      }),
    update: (id, title, content, popupEnabled, displayEnabled) =>
      rpc('popupNotices.update', {
        id,
        title,
        content,
        popup_enabled: popupEnabled,
        display_enabled: displayEnabled
      }),
    delete: (id) => rpc('popupNotices.delete', { id })
  },
  deviceVerification: {
    getSettings: () => rpc('deviceVerification.getSettings'),
    updateSettings: (verifyCooldownSeconds) =>
      rpc('deviceVerification.updateSettings', { verify_cooldown_seconds: verifyCooldownSeconds }),
    findAll: () => rpc('deviceVerification.findAll'),
    findById: (id) => rpc('deviceVerification.findById', { id }),
    findByDeviceId: (deviceId) => rpc('deviceVerification.findByDeviceId', { device_id: deviceId }),
    create: (deviceId, maxVerifications = 10, questionId = null, firmwareId = null, isWhitelisted = false) =>
      rpc('deviceVerification.create', { device_id: deviceId, max_verifications: maxVerifications, question_id: questionId, firmware_id: firmwareId, is_whitelisted: isWhitelisted }),
    updateMaxVerifications: (deviceId, maxVerifications) =>
      rpc('deviceVerification.updateMaxVerifications', { device_id: deviceId, max_verifications: maxVerifications }),
    updateQuestionId: (deviceId, questionId) =>
      rpc('deviceVerification.updateQuestionId', { device_id: deviceId, question_id: questionId }),
    updateFirmwareId: (deviceId, firmwareId) =>
      rpc('deviceVerification.updateFirmwareId', { device_id: deviceId, firmware_id: firmwareId }),
    updateWhitelist: (deviceId, isWhitelisted) =>
      rpc('deviceVerification.updateWhitelist', { device_id: deviceId, is_whitelisted: isWhitelisted }),
    cleanupUnwhitelistedExpired: (ttlMinutes = 30) =>
      rpc('deviceVerification.cleanupUnwhitelistedExpired', { ttl_minutes: ttlMinutes }),
    addMaxVerifications: (deviceId, addCount) =>
      rpc('deviceVerification.addMaxVerifications', { device_id: deviceId, add_count: addCount }),
    delete: (deviceId) => rpc('deviceVerification.delete', { device_id: deviceId }),
    verify: (deviceId, ipAddress = null, userAgent = null) =>
      rpc('deviceVerification.verify', { device_id: deviceId, ip_address: ipAddress, user_agent: userAgent }),
    resetCount: (deviceId) => rpc('deviceVerification.resetCount', { device_id: deviceId }),
    getPublicKey: (deviceId) => rpc('deviceVerification.getPublicKey', { device_id: deviceId }),
    getPrivateKey: (deviceId) => rpc('deviceVerification.getPrivateKey', { device_id: deviceId }),
    getKeys: (deviceId) => rpc('deviceVerification.getKeys', { device_id: deviceId }),
    verifySignature: (deviceId, signature, issuedAt) =>
      rpc('deviceVerification.verifySignature', { device_id: deviceId, signature, issued_at: issuedAt }),
    findLogsByDeviceId: (deviceId, limit = 100, offset = 0) =>
      rpc('deviceVerification.findLogsByDeviceId', { device_id: deviceId, limit, offset }),
    countLogsByDeviceId: (deviceId) =>
      rpc('deviceVerification.countLogsByDeviceId', { device_id: deviceId }),
    findAllLogs: (limit = 100, offset = 0) =>
      rpc('deviceVerification.findAllLogs', { limit, offset }),
    countAllLogs: () => rpc('deviceVerification.countAllLogs'),
    listFirmwareFiles: () => rpc('deviceVerification.listFirmwareFiles'),
    createFirmwareFile: (fileName, fileUrl, fileSize = 0, checksumSha256 = null, remark = null) =>
      rpc('deviceVerification.createFirmwareFile', {
        file_name: fileName,
        file_url: fileUrl,
        file_size: fileSize,
        checksum_sha256: checksumSha256,
        remark
      }),
    updateFirmwareRemark: (id, remark) =>
      rpc('deviceVerification.updateFirmwareRemark', { id, remark }),
    deleteFirmwareFile: (id) => rpc('deviceVerification.deleteFirmwareFile', { id }),
    setDefaultFirmware: (id) => rpc('deviceVerification.setDefaultFirmware', { id })
  },
  questions: {
    findAll: () => rpc('questions.findAll'),
    findById: (id) => rpc('questions.findById', { id }),
    create: (name, categoryName = null, dbFilePath = null, vectorFilePath = null) =>
      rpc('questions.create', { name, category_name: categoryName, db_file_path: dbFilePath, vector_file_path: vectorFilePath }),
    update: (id, name, categoryName = null, dbFilePath = null, vectorFilePath = null) =>
      rpc('questions.update', { id, name, category_name: categoryName, db_file_path: dbFilePath, vector_file_path: vectorFilePath }),
    updateFields: (id, name = null, categoryName = null, dbFilePath = null, vectorFilePath = null) =>
      rpc('questions.updateFields', { id, name, category_name: categoryName, db_file_path: dbFilePath, vector_file_path: vectorFilePath }),
    delete: (id) => rpc('questions.delete', { id })
  }
};

module.exports = { db: null, dbOperations };
