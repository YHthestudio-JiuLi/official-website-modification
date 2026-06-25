const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const { translateProduct, translateProducts } = require('../../translate');
const { notifyForumNewPost, notifyForumNewReply, notifyOrderPaid } = require('../../telegram');
const { verifyOrderPaymentTx, messageForVerifyFailure } = require('../../usdt-tx-verify');
const questionsService = require('../../services/questionsService');
const { comparePassword } = require('../lib/password');
const { saveSession } = require('../lib/session');
const { verifyLegacyNodeBridgeToken } = require('../lib/bridge-token');

function registerLegacyMigratedRoutes(app, deps) {
  const {
    logger,
    dbOperations,
    loginLimiter,
    requireUser,
    requireAdmin,
    canAccessLegacyAdminApiAsync,
    resolveLegacyAdminFromBridge,
    tryPersistAdminSession,
    productImageUpload,
    productUploadsPath,
    questionFilesUpload,
    questionChunkUpload,
    questionChunksPath,
    questionUploadsPath,
    questionChunkSessions,
    questionCompletedUploads,
    buildQuestionStoredName,
    cleanupQuestionChunkSession,
    consumeCompletedQuestionUpload,
    mergeChunkFiles,
    getPaymentSettings,
    clearPaymentSettingsCache,
    normalizeProductRecord,
    getUsdtWalletAddress,
    normalizeUploadFileName,
    serializeProductDetailJson,
    parseProductCategoryId,
    parseProductSubCategoryId,
    parseCategoryParentId
  } = deps;

app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ user: null });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const user = await dbOperations.users.findByUsername(username);

  if (user && await comparePassword(password, user.password)) {
    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await dbOperations.users.findByUsername(username);
  if (existingUser) {
    return res.status(400).json({ message: 'Username already exists' });
  }

  const existingEmail = await dbOperations.users.findByEmail(email);
  if (existingEmail) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = await dbOperations.users.create(username, email, hashedPassword, 0);

  req.session.user = { id: userId, username, email };
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.user = null;
  res.json({ message: 'Logged out' });
});

// ==================== 产品 API ====================

app.get('/api/product-categories', async (req, res) => {
  try {
    const categories = await dbOperations.productCategories.findAll();
    res.json(categories);
  } catch (error) {
    console.error('[API Error] /api/product-categories:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await dbOperations.products.findAll();
    const translatedProducts = translateProducts(products).map(normalizeProductRecord);
    res.json(translatedProducts);
  } catch (error) {
    console.error('[API Error] /api/products:', error.message);
    res.status(503).json({ error: 'Database service unavailable. Please start Python backend with: npm run py' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await dbOperations.products.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const translatedProduct = normalizeProductRecord(translateProduct(product));
    res.json(translatedProduct);
  } catch (error) {
    console.error('[API Error] /api/products/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// ==================== 订单 API ====================

app.get('/api/payment-settings', async (req, res) => {
  const settings = await getPaymentSettings();
  res.json(settings || { network: 'TRC20' });
});

app.post('/api/orders', requireUser, async (req, res) => {
  const { productId, quantity = 1, shippingAddress } = req.body;
  const product = await dbOperations.products.findById(parseInt(productId));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const walletAddress = await getUsdtWalletAddress();
  const paymentSettings = await getPaymentSettings();
  const network = paymentSettings ? paymentSettings.network : 'TRC20';

  const translatedProduct = translateProduct(product);
  const orderData = {
    userId: req.session.user.id,
    username: req.session.user.username,
    productId: product.id,
    productName: translatedProduct.name,
    quantity: parseInt(quantity),
    price: product.priceUsdt || product.price || 0,
    totalAmount: (product.priceUsdt || product.price || 0) * parseInt(quantity),
    status: 'pending',
    paymentMethod: 'USDT',
    usdtWallet: walletAddress,
    network: network,
    shippingAddress: shippingAddress
  };

  const orderId = await dbOperations.orders.create(orderData);
  res.json({ orderId });
});

app.get('/api/orders', requireUser, async (req, res) => {
  const orders = await dbOperations.orders.findByUserId(req.session.user.id);
  res.json(orders);
});

app.get('/api/orders/:id', requireUser, async (req, res) => {
  const id = parseInt(req.params.id);
  const order = await dbOperations.orders.findById(id);
  if (!order || order.userId !== req.session.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (!order.network) {
    const paymentSettings = await getPaymentSettings();
    order.network = paymentSettings ? paymentSettings.network : 'TRC20';
  }
  res.json(order);
});

app.post('/api/orders/:id/confirm', requireUser, async (req, res) => {
  const id = parseInt(req.params.id);
  const order = await dbOperations.orders.findById(id);
  if (!order || order.userId !== req.session.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (order.status !== 'pending') {
    return res.status(400).json({ error: 'Order is already confirmed or not payable' });
  }

  const { txHash, shippingAddress } = req.body;
  if (!shippingAddress || !shippingAddress.trim()) {
    return res.status(400).json({ error: 'Shipping address required' });
  }

  if (txHash && txHash.trim()) {
    const trimmedHash = txHash.trim();
    const settings = await getPaymentSettings();
    const verification = await verifyOrderPaymentTx({
      network: order.network || 'TRC20',
      txHash: trimmedHash,
      expectedAmountUsdt: Number(order.totalAmount),
      expectedWalletAddress: settings?.wallet_address || order.usdtWallet || '',
      maxUnderpayUsdt: settings?.txVerifyMaxUnderpayUsdt != null
        ? Number(settings.txVerifyMaxUnderpayUsdt)
        : 5,
      maxAgeHours: settings?.txVerifyMaxAgeHours != null
        ? Number(settings.txVerifyMaxAgeHours)
        : 2,
    });

    if (!verification.valid) {
      if (verification.deleteOrder) {
        await dbOperations.orders.delete(id);
        const locale = String(req.headers['accept-language'] || 'zh');
        const msg = messageForVerifyFailure(verification.reason, {
          locale,
          expectedAmountUsdt: Number(order.totalAmount),
          paidAmount: verification.paidAmount,
          maxUnderpayUsdt: settings?.txVerifyMaxUnderpayUsdt != null
            ? Number(settings.txVerifyMaxUnderpayUsdt)
            : 5,
          maxAgeHours: settings?.txVerifyMaxAgeHours != null
            ? Number(settings.txVerifyMaxAgeHours)
            : 2,
        });
        return res.status(422).json({ success: false, deleted: true, reason: verification.reason, message: msg });
      }
      const locale = String(req.headers['accept-language'] || 'zh');
      const msg = verification.reason === 'tx_not_found'
        ? messageForVerifyFailure('tx_not_found', { locale })
        : messageForVerifyFailure(verification.reason, { locale });
      return res.status(422).json({ success: false, deleted: false, reason: verification.reason, message: msg });
    }

    await dbOperations.orders.updateShippingAddress(id, shippingAddress.trim());
    await dbOperations.orders.updateTxHash(id, trimmedHash);
    await dbOperations.orders.updateStatus(id, 'paid');
    try {
      const updatedOrder = await dbOperations.orders.findById(id);
      if (updatedOrder) {
        const underpay = settings?.txVerifyMaxUnderpayUsdt != null
          ? Number(settings.txVerifyMaxUnderpayUsdt)
          : 5;
        const maxAge = settings?.txVerifyMaxAgeHours != null
          ? Number(settings.txVerifyMaxAgeHours)
          : 2;
        const notifyPayload = {
          ...updatedOrder,
          txVerifyDisabled: underpay <= 0 && maxAge <= 0,
        };
        notifyOrderPaid(notifyPayload).catch((err) => {
          console.error('[Order Telegram] notify error:', err.message || err);
        });
      }
    } catch (err) {
      console.error('[Order Telegram] fetch order error:', err.message || err);
    }
    res.json({ success: true, message: 'Payment successful!' });
  } else {
    res.status(400).json({ error: 'Transaction hash required' });
  }
});

// 用户取消自己的订单（仅允许取消 pending 状态的订单）
app.put('/api/orders/:id/status', requireUser, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, cancelReason } = req.body;

  // 只允许取消订单
  if (status !== 'cancelled') {
    return res.status(400).json({ error: 'Only cancellation is allowed via this endpoint' });
  }

  const order = await dbOperations.orders.findById(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // 验证订单所有权
  if (order.userId !== req.session.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // 只允许取消 pending 状态的订单
  if (order.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending orders can be cancelled' });
  }

  await dbOperations.orders.updateStatus(id, 'cancelled');
  logger.info(`Order ${id} cancelled by user ${req.session.user.username}`, {
    orderId: id,
    userId: req.session.user.id,
    reason: cancelReason
  });
  res.json({ success: true });
});

// ==================== 论坛 API ====================

app.get('/api/forum/posts', async (req, res) => {
  const posts = await dbOperations.forumPosts.findAll();
  res.json(posts);
});

app.get('/api/forum/posts/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const post = await dbOperations.forumPosts.findById(id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json(post);
});

app.post('/api/forum/posts', requireUser, async (req, res) => {
  const { title, content } = req.body;
  const date = new Date().toISOString().split('T')[0];
  await dbOperations.forumPosts.create(title, req.session.user.username, content, date, 0);
  
  // 发送 Telegram 通知
  try {
    const post = {
      id: await dbOperations.forumPosts.findAll().then(posts => posts[posts.length - 1]?.id),
      title,
      author: req.session.user.username,
      content,
      date
    };
    notifyForumNewPost(post).catch((err) => {
      console.error('[Forum Telegram] Post notification error:', err.message || err);
    });
  } catch (err) {
    console.error('[Forum Telegram] Get post info error:', err.message || err);
  }
  
  res.json({ success: true });
});

app.get('/api/forum/posts/:id/replies', async (req, res) => {
  const id = parseInt(req.params.id);
  const replies = await dbOperations.forumReplies.findByPostId(id);
  res.json(replies);
});

app.post('/api/forum/posts/:id/replies', requireUser, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { content, parentReplyId } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content required' });
  }

  let parentReplyIdInt = null;
  if (parentReplyId) {
    parentReplyIdInt = parseInt(parentReplyId);
    const parentReply = await dbOperations.forumReplies.findById(parentReplyIdInt);
    if (!parentReply || parentReply.postId !== postId) {
      return res.status(400).json({ error: 'Invalid parent reply' });
    }
  }

  // ForumReplyManager.create() 已经处理了回复计数，无需再次调用 incrementReplies
  await dbOperations.forumReplies.create(postId, req.session.user.username, content.trim(), parentReplyIdInt);
  
  // 发送 Telegram 通知
  try {
    const post = await dbOperations.forumPosts.findById(postId);
    const replies = await dbOperations.forumReplies.findByPostId(postId);
    const newReply = replies[replies.length - 1];
    
    let parentReply = null;
    if (parentReplyIdInt) {
      parentReply = await dbOperations.forumReplies.findById(parentReplyIdInt);
    }
    
    if (post && newReply) {
      notifyForumNewReply(newReply, post, parentReply).catch((err) => {
        console.error('[Forum Telegram] Reply notification error:', err.message || err);
      });
    }
  } catch (err) {
    console.error('[Forum Telegram] Get reply info error:', err.message || err);
  }
  
  res.json({ success: true });
});

app.delete('/api/forum/replies/:id', requireUser, async (req, res) => {
  const replyId = parseInt(req.params.id);
  const reply = await dbOperations.forumReplies.findById(replyId);

  if (!reply) {
    return res.status(404).json({ error: 'Reply not found' });
  }

  if (reply.author !== req.session.user.username && !req.session.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await dbOperations.forumReplies.delete(replyId);
  res.json({ success: true });
});

// ==================== 购物车 API ====================

app.get('/api/cart', requireUser, async (req, res) => {
  try {
    const cart = await dbOperations.cart.get(req.session.user.id)
    res.json((cart || []).map(normalizeProductRecord));
  } catch (error) {
    console.error('[API Error] /api/cart:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/cart/items', requireUser, async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Product ID required' });
  }
  try {
    await dbOperations.cart.addItem(req.session.user.id, parseInt(productId), parseInt(quantity));
    res.json({ success: true });
  } catch (error) {
    console.error('[API Error] POST /api/cart/items:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/cart/items/:productId', requireUser, async (req, res) => {
  const { quantity } = req.body;
  try {
    await dbOperations.cart.updateQuantity(req.session.user.id, parseInt(req.params.productId), parseInt(quantity));
    res.json({ success: true });
  } catch (error) {
    console.error('[API Error] PUT /api/cart/items/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.delete('/api/cart/items/:productId', requireUser, async (req, res) => {
  try {
    await dbOperations.cart.removeItem(req.session.user.id, parseInt(req.params.productId));
    res.json({ success: true });
  } catch (error) {
    console.error('[API Error] DELETE /api/cart/items/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.delete('/api/cart', requireUser, async (req, res) => {
  try {
    await dbOperations.cart.clear(req.session.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[API Error] DELETE /api/cart:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// ==================== 管理员认证 API ====================

app.get('/api/admin/auth/me', async (req, res) => {
  try {
    if (!req.session.admin) {
      const bridged = await resolveLegacyAdminFromBridge(req);
      if (bridged) {
        await tryPersistAdminSession(req, bridged);
      }
    }
    if (req.session.admin) {
      return res.json({ admin: req.session.admin });
    }
    return res.status(401).json({ admin: null });
  } catch (error) {
    console.error('[admin/auth/me] 失败:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/admin/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await dbOperations.users.findByUsername(username);

    if (user && await canAccessLegacyAdminApiAsync(user) && await comparePassword(password, user.password)) {
      req.session.admin = { id: user.id, username: user.username, email: user.email };
      await saveSession(req);
      res.json({ admin: req.session.admin });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('[admin/auth/login] 失败:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

/** Laravel V2 已登录时，用短期 bridge token 建立 Node admin 会话（生产双栈 Cookie 同步） */
app.post('/api/admin/auth/establish', express.json(), async (req, res) => {
  const uid = verifyLegacyNodeBridgeToken(req.body?.token);
  if (!uid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  try {
    const user = await dbOperations.users.findById(uid);
    if (!user || !(await canAccessLegacyAdminApiAsync(user))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.session.admin = { id: user.id, username: user.username, email: user.email };
    await saveSession(req);
    return res.json({ admin: req.session.admin });
  } catch (error) {
    console.error('[admin/auth/establish] 失败:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/admin/auth/logout', (req, res) => {
  req.session.admin = null;
  res.json({ message: 'Logged out' });
});

// ==================== 管理后台 API ====================

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const users = await dbOperations.users.findAll();
  const products = await dbOperations.products.findAll();
  const posts = await dbOperations.forumPosts.findAll();
  const orderStats = await dbOperations.orders.getStats();

  res.json({
    totalUsers: users.length,
    totalProducts: products.length,
    totalPosts: posts.length,
    totalOrders: orderStats.total,
    pendingOrders: orderStats.pending,
    totalRevenue: orderStats.revenue
  });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await dbOperations.users.findAll();
  res.json(users);
});

app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await dbOperations.users.findById(parseInt(req.params.id));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { username, email, password, isAdmin } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const existingUsername = await dbOperations.users.findByUsername(username);
  if (existingUsername) {
    return res.status(400).json({ message: 'Username already exists' });
  }

  const existingEmail = await dbOperations.users.findByEmail(email);
  if (existingEmail) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  const parseAdminFlag = (value) => {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    return 0;
  };

  const hashedPassword = await bcrypt.hash(password, 10);
  await dbOperations.users.create(username, email, hashedPassword, parseAdminFlag(isAdmin));
  res.json({ success: true });
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { email, password, isAdmin } = req.body;
  const userId = parseInt(req.params.id);

  const user = await dbOperations.users.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const existingUser = await dbOperations.users.findByEmail(email);
  if (existingUser && existingUser.id !== userId) {
    return res.status(400).json({ message: 'Email already in use' });
  }

  const parseAdminFlag = (value) => {
    if (value === true || value === 1 || value === '1' || value === 'true') return 1;
    return 0;
  };
  const nextIsAdmin = parseAdminFlag(isAdmin);

  // 防止管理员修改资料/密码时误把自己降级，导致立刻无法登录后台
  if (req.session?.admin?.id === userId && nextIsAdmin !== 1) {
    return res.status(400).json({ message: 'Cannot remove your own admin role' });
  }

  let hashedPassword = null;
  if (password && password.trim() !== '') {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  await dbOperations.users.update(userId, email, hashedPassword, nextIsAdmin);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  await dbOperations.users.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const products = await dbOperations.products.findAll();
  res.json(products.map(normalizeProductRecord));
});

app.get('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const product = await dbOperations.products.findById(parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(normalizeProductRecord(product));
});

app.post('/api/admin/upload/product-image', requireAdmin, (req, res) => {
  productImageUpload.single('image')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image is too large (max 5MB)' });
      }
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    try {
      // 入库为 BLOB，返回可访问的图片 URL
      const dataBase64 = req.file.buffer.toString('base64');
      const mime = req.file.mimetype || 'application/octet-stream';
      const filename = req.file.originalname || null;
      const imageId = await dbOperations.images.create(dataBase64, mime, filename);
      return res.json({ ok: true, image: `/api/product-images/${imageId}` });
    } catch (e) {
      console.error('[API Error] upload product-image:', e.message);
      return res.status(503).json({ error: 'Failed to store image' });
    }
  });
});

// 从 MySQL 读取并输出图片二进制
app.get('/api/product-images/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid image id' });
  }
  try {
    const img = await dbOperations.images.get(id);
    if (!img) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const buffer = Buffer.from(img.dataBase64 || '', 'base64');
    res.setHeader('Content-Type', img.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(buffer);
  } catch (e) {
    console.error('[API Error] get product-image:', e.message);
    return res.status(503).json({ error: 'Failed to load image' });
  }
});

app.delete('/api/admin/upload/product-image', requireAdmin, async (req, res) => {
  const imagePath = req.body?.image || '';
  // 新格式：/api/product-images/<id> → 删除 MySQL BLOB
  const apiMatch = typeof imagePath === 'string' && imagePath.match(/^\/api\/product-images\/(\d+)$/);
  if (apiMatch) {
    try {
      await dbOperations.images.delete(parseInt(apiMatch[1], 10));
    } catch (e) {
      console.error('[API Error] delete product-image:', e.message);
    }
    return res.json({ ok: true });
  }
  // 兼容旧的磁盘图片路径
  if (typeof imagePath !== 'string' || !imagePath.startsWith('/uploads/products/')) {
    return res.status(400).json({ error: 'Invalid image path' });
  }
  const filename = path.basename(imagePath);
  const target = path.join(productUploadsPath, filename);
  if (!target.startsWith(productUploadsPath)) {
    return res.status(400).json({ error: 'Invalid image path' });
  }
  if (!fs.existsSync(target)) {
    return res.json({ ok: true });
  }
  fs.unlink(target, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete image' });
    }
    return res.json({ ok: true });
  });
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { name, description, image, date, priceUsdt } = req.body;
  const price = parseFloat(priceUsdt) || 0;
  const productDate = date || new Date().toISOString().split('T')[0];
  const { featuresJson, specsJson, usageNoticeJson } = serializeProductDetailJson(req.body);
  const categoryId = parseProductCategoryId(req.body);
  const subCategoryId = parseProductSubCategoryId(req.body);
  await dbOperations.products.create(
    name, description, image, productDate, price, price,
    featuresJson, specsJson, usageNoticeJson, categoryId, subCategoryId
  );
  res.json({ success: true });
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { name, description, image, date, priceUsdt } = req.body;
  const price = parseFloat(priceUsdt) || 0;
  const productDate = date || new Date().toISOString().split('T')[0];
  const { featuresJson, specsJson, usageNoticeJson } = serializeProductDetailJson(req.body);
  const categoryId = parseProductCategoryId(req.body);
  const subCategoryId = parseProductSubCategoryId(req.body);
  await dbOperations.products.update(
    parseInt(req.params.id), name, description, image, productDate, price, price,
    featuresJson, specsJson, usageNoticeJson, categoryId, subCategoryId
  );
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  await dbOperations.products.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/product-categories', requireAdmin, async (req, res) => {
  const categories = await dbOperations.productCategories.findAll();
  res.json(categories);
});

app.post('/api/admin/product-categories', requireAdmin, async (req, res) => {
  const { name, nameEn, slug, sortOrder } = req.body || {};
  const parentId = parseCategoryParentId(req.body);
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    const id = await dbOperations.productCategories.create(
      String(name).trim(),
      nameEn ? String(nameEn).trim() : null,
      slug ? String(slug).trim() : null,
      parseInt(sortOrder, 10) || 0,
      parentId
    );
    res.json({ success: true, id });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to create category' });
  }
});

app.put('/api/admin/product-categories/:id', requireAdmin, async (req, res) => {
  const { name, nameEn, slug, sortOrder } = req.body || {};
  const parentId = parseCategoryParentId(req.body);
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    await dbOperations.productCategories.update(
      parseInt(req.params.id, 10),
      String(name).trim(),
      nameEn ? String(nameEn).trim() : null,
      slug ? String(slug).trim() : null,
      parseInt(sortOrder, 10) || 0,
      parentId
    );
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to update category' });
  }
});

app.delete('/api/admin/product-categories/:id', requireAdmin, async (req, res) => {
  try {
    await dbOperations.productCategories.delete(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to delete category' });
  }
});

app.get('/api/admin/questions', requireAdmin, async (req, res) => {
  try {
    const questions = await questionsService.findAll();
    res.json(questions);
  } catch (error) {
    logger.error('Failed to get questions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/questions/:id', requireAdmin, async (req, res) => {
  try {
    const question = await questionsService.findById(parseInt(req.params.id));
    res.json(question);
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      return res.status(404).json({ error: 'Question not found' });
    }
    logger.error('Failed to get question:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/questions/upload/init', requireAdmin, (req, res) => {
  const fileName = normalizeUploadFileName(String(req.body?.fileName || '').trim());
  const fileField = String(req.body?.fileField || '').trim();
  const fileSize = parseInt(req.body?.fileSize, 10);
  const totalChunks = parseInt(req.body?.totalChunks, 10);
  const ext = path.extname(fileName).toLowerCase();
  const allowMap = {
    dbFile: ['.db', '.sqlite', '.sqlite3'],
    vectorFile: ['.index']
  };
  const allowExts = allowMap[fileField];
  if (!allowExts) {
    return res.status(400).json({ error: 'Invalid fileField' });
  }
  if (!fileName || fileName.length > 255) {
    return res.status(400).json({ error: 'Invalid fileName' });
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > 2 * 1024 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid fileSize' });
  }
  if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 10000) {
    return res.status(400).json({ error: 'Invalid totalChunks' });
  }
  if (!allowExts.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }
  const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  const chunkDir = path.join(questionChunksPath, uploadId);
  fs.mkdirSync(chunkDir, { recursive: true });
  questionChunkSessions.set(uploadId, {
    fileName,
    fileField,
    fileSize,
    totalChunks,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  res.json({ ok: true, uploadId, chunkSize: 5 * 1024 * 1024 });
});

app.post('/api/admin/questions/upload/chunk', requireAdmin, (req, res) => {
  questionChunkUpload.single('chunk')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Chunk too large' });
      }
      return res.status(400).json({ error: err.message || 'Chunk upload failed' });
    }
    const uploadId = String(req.body?.uploadId || '').trim();
    const chunkIndex = parseInt(req.body?.chunkIndex, 10);
    const totalChunks = parseInt(req.body?.totalChunks, 10);
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(uploadId)) {
      return res.status(400).json({ error: 'Invalid uploadId' });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100000) {
      return res.status(400).json({ error: 'Invalid chunkIndex' });
    }
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 10000) {
      return res.status(400).json({ error: 'Invalid totalChunks' });
    }
    const session = questionChunkSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({ error: 'Upload session expired' });
    }
    if (session.totalChunks !== totalChunks) {
      return res.status(400).json({ error: 'Chunk metadata mismatch' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No chunk uploaded' });
    }
    session.updatedAt = Date.now();
    res.json({ ok: true });
  });
});

app.post('/api/admin/questions/upload/complete', requireAdmin, async (req, res) => {
  const uploadId = String(req.body?.uploadId || '').trim();
  const fileName = normalizeUploadFileName(String(req.body?.fileName || '').trim());
  const fileField = String(req.body?.fileField || '').trim();
  const fileSize = parseInt(req.body?.fileSize, 10);
  const totalChunks = parseInt(req.body?.totalChunks, 10);
  const session = questionChunkSessions.get(uploadId);
  if (!session) {
    return res.status(404).json({ error: 'Upload session expired' });
  }
  if (
    session.fileName !== fileName ||
    session.fileField !== fileField ||
    session.fileSize !== fileSize ||
    session.totalChunks !== totalChunks
  ) {
    cleanupQuestionChunkSession(uploadId);
    return res.status(400).json({ error: 'Upload metadata mismatch' });
  }
  const chunkDir = path.join(questionChunksPath, uploadId);
  const storedName = buildQuestionStoredName(fileName);
  const finalPath = path.join(questionUploadsPath, storedName);
  const mergeStarted = Date.now();
  console.log('[QuestionUpload] complete 开始合并', { uploadId, fileName, totalChunks });
  try {
    await mergeChunkFiles(chunkDir, totalChunks, finalPath);
    const stat = fs.statSync(finalPath);
    console.log('[QuestionUpload] complete 合并完成', {
      uploadId,
      bytes: stat.size,
      ms: Date.now() - mergeStarted
    });
    if (!stat || !stat.size || stat.size <= 0) {
      throw new Error('Merged question file is empty');
    }
    questionCompletedUploads.set(uploadId, {
      fileField,
      originalName: fileName,
      storedPath: finalPath,
      createdAt: Date.now()
    });
    cleanupQuestionChunkSession(uploadId);
    res.json({ ok: true, uploadId });
  } catch (error) {
    console.error('[QuestionUpload] complete 合并失败', {
      uploadId,
      ms: Date.now() - mergeStarted,
      error: error.message
    });
    if (fs.existsSync(finalPath)) {
      fs.rmSync(finalPath, { force: true });
    }
    cleanupQuestionChunkSession(uploadId);
    res.status(500).json({ error: error.message || 'Complete question upload failed' });
  }
});

app.post('/api/admin/questions', requireAdmin, questionFilesUpload.fields([
  { name: 'dbFile', maxCount: 1 },
  { name: 'vectorFile', maxCount: 1 }
]), async (req, res) => {
  console.log('[Questions] req.body:', req.body);
  console.log('[Questions] req.files:', req.files);
  let consumedDbChunk = null;
  let consumedVectorChunk = null;
  
  try {
    const FormData = require('form-data');
    const formData = new FormData();
    
    const name = req.body?.name || req.body?.['name'] || '';
    const categoryName = (req.body?.category_name || req.body?.['category_name'] || '').trim();
    console.log('[Questions] name value:', name);
    
    formData.append('name', name);
    if (categoryName) {
      formData.append('category_name', categoryName);
    }
    
    const dbChunkUploadId = String(req.body?.dbChunkUploadId || '').trim();
    const vectorChunkUploadId = String(req.body?.vectorChunkUploadId || '').trim();
    consumedDbChunk = dbChunkUploadId ? consumeCompletedQuestionUpload(dbChunkUploadId, 'dbFile') : null;
    consumedVectorChunk = vectorChunkUploadId ? consumeCompletedQuestionUpload(vectorChunkUploadId, 'vectorFile') : null;

    if (req.files?.dbFile?.[0]) {
      const dbFile = req.files.dbFile[0];
      formData.append('db_file', fs.createReadStream(dbFile.path), {
        filename: dbFile.originalname,
        contentType: dbFile.mimetype
      });
    } else if (consumedDbChunk?.storedPath) {
      formData.append('db_file', fs.createReadStream(consumedDbChunk.storedPath), {
        filename: consumedDbChunk.originalName || path.basename(consumedDbChunk.storedPath)
      });
    }
    
    if (req.files?.vectorFile?.[0]) {
      const vectorFile = req.files.vectorFile[0];
      formData.append('vector_file', fs.createReadStream(vectorFile.path), {
        filename: vectorFile.originalname,
        contentType: vectorFile.mimetype
      });
    } else if (consumedVectorChunk?.storedPath) {
      formData.append('vector_file', fs.createReadStream(consumedVectorChunk.storedPath), {
        filename: consumedVectorChunk.originalName || path.basename(consumedVectorChunk.storedPath)
      });
    }
    
    const result = await questionsService.createWithFiles(formData);
    
    if (req.files?.dbFile?.[0]) {
      try { fs.unlinkSync(req.files.dbFile[0].path); } catch (e) {}
    }
    if (req.files?.vectorFile?.[0]) {
      try { fs.unlinkSync(req.files.vectorFile[0].path); } catch (e) {}
    }
    if (consumedDbChunk?.storedPath) {
      try { fs.unlinkSync(consumedDbChunk.storedPath); } catch (e) {}
    }
    if (consumedVectorChunk?.storedPath) {
      try { fs.unlinkSync(consumedVectorChunk.storedPath); } catch (e) {}
    }
    
    res.json({ success: true, id: result.id, dbFilePath: result.db_file_path, vectorFilePath: result.vector_file_path });
  } catch (error) {
    logger.error('Failed to create question:', error);
    if (req.files?.dbFile?.[0]) {
      try { fs.unlinkSync(req.files.dbFile[0].path); } catch (e) {}
    }
    if (req.files?.vectorFile?.[0]) {
      try { fs.unlinkSync(req.files.vectorFile[0].path); } catch (e) {}
    }
    if (consumedDbChunk?.storedPath) {
      try { fs.unlinkSync(consumedDbChunk.storedPath); } catch (e) {}
    }
    if (consumedVectorChunk?.storedPath) {
      try { fs.unlinkSync(consumedVectorChunk.storedPath); } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/questions/:id', requireAdmin, questionFilesUpload.fields([
  { name: 'dbFile', maxCount: 1 },
  { name: 'vectorFile', maxCount: 1 }
]), async (req, res) => {
  let consumedDbChunk = null;
  let consumedVectorChunk = null;
  try {
    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('name', req.body.name || '');
    const categoryName = (req.body?.category_name || '').trim();
    if (categoryName) {
      formData.append('category_name', categoryName);
    }
    
    if (req.body.clearDbFile === 'true' || req.body.clearDbFile === true) {
      formData.append('clear_db_file', 'true');
    }
    if (req.body.clearVectorFile === 'true' || req.body.clearVectorFile === true) {
      formData.append('clear_vector_file', 'true');
    }
    
    const dbChunkUploadId = String(req.body?.dbChunkUploadId || '').trim();
    const vectorChunkUploadId = String(req.body?.vectorChunkUploadId || '').trim();
    consumedDbChunk = dbChunkUploadId ? consumeCompletedQuestionUpload(dbChunkUploadId, 'dbFile') : null;
    consumedVectorChunk = vectorChunkUploadId ? consumeCompletedQuestionUpload(vectorChunkUploadId, 'vectorFile') : null;

    if (req.files?.dbFile?.[0]) {
      const dbFile = req.files.dbFile[0];
      formData.append('db_file', fs.createReadStream(dbFile.path), {
        filename: dbFile.originalname,
        contentType: dbFile.mimetype
      });
    } else if (consumedDbChunk?.storedPath) {
      formData.append('db_file', fs.createReadStream(consumedDbChunk.storedPath), {
        filename: consumedDbChunk.originalName || path.basename(consumedDbChunk.storedPath)
      });
    }
    
    if (req.files?.vectorFile?.[0]) {
      const vectorFile = req.files.vectorFile[0];
      formData.append('vector_file', fs.createReadStream(vectorFile.path), {
        filename: vectorFile.originalname,
        contentType: vectorFile.mimetype
      });
    } else if (consumedVectorChunk?.storedPath) {
      formData.append('vector_file', fs.createReadStream(consumedVectorChunk.storedPath), {
        filename: consumedVectorChunk.originalName || path.basename(consumedVectorChunk.storedPath)
      });
    }
    
    const result = await questionsService.updateWithFiles(parseInt(req.params.id), formData);
    
    if (req.files?.dbFile?.[0]) {
      try { fs.unlinkSync(req.files.dbFile[0].path); } catch (e) {}
    }
    if (req.files?.vectorFile?.[0]) {
      try { fs.unlinkSync(req.files.vectorFile[0].path); } catch (e) {}
    }
    if (consumedDbChunk?.storedPath) {
      try { fs.unlinkSync(consumedDbChunk.storedPath); } catch (e) {}
    }
    if (consumedVectorChunk?.storedPath) {
      try { fs.unlinkSync(consumedVectorChunk.storedPath); } catch (e) {}
    }
    
    res.json({ success: true, dbFilePath: result.db_file_path, vectorFilePath: result.vector_file_path });
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      return res.status(404).json({ error: 'Question not found' });
    }
    logger.error('Failed to update question:', error);
    if (req.files?.dbFile?.[0]) {
      try { fs.unlinkSync(req.files.dbFile[0].path); } catch (e) {}
    }
    if (req.files?.vectorFile?.[0]) {
      try { fs.unlinkSync(req.files.vectorFile[0].path); } catch (e) {}
    }
    if (consumedDbChunk?.storedPath) {
      try { fs.unlinkSync(consumedDbChunk.storedPath); } catch (e) {}
    }
    if (consumedVectorChunk?.storedPath) {
      try { fs.unlinkSync(consumedVectorChunk.storedPath); } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
  try {
    await questionsService.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      return res.status(404).json({ error: 'Question not found' });
    }
    logger.error('Failed to delete question:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  const posts = await dbOperations.forumPosts.findAll();
  res.json(posts);
});

app.get('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const post = await dbOperations.forumPosts.findById(parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json(post);
});

app.post('/api/admin/posts', requireAdmin, async (req, res) => {
  const { title, author, content, date } = req.body;
  const postDate = date || new Date().toISOString().split('T')[0];
  const postAuthor = author || 'Admin';
  await dbOperations.forumPosts.create(title, postAuthor, content, postDate, 0);
  res.json({ success: true });
});

app.put('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const { title, author, content, date, replies } = req.body;
  const postDate = date || new Date().toISOString().split('T')[0];
  const replyCount = parseInt(replies) || 0;
  const postAuthor = author || 'Admin';
  await dbOperations.forumPosts.update(parseInt(req.params.id), title, postAuthor, content, postDate, replyCount);
  res.json({ success: true });
});

app.post('/api/admin/posts/:id/pin', requireAdmin, async (req, res) => {
  await dbOperations.forumPosts.togglePin(parseInt(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  await dbOperations.forumPosts.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/posts/:id/replies', requireAdmin, async (req, res) => {
  const postId = parseInt(req.params.id);
  if (Number.isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }
  const post = await dbOperations.forumPosts.findById(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  const replies = await dbOperations.forumReplies.findByPostId(postId);
  res.json({ replies });
});

app.delete('/api/admin/replies/:id', requireAdmin, async (req, res) => {
  const replyId = parseInt(req.params.id);
  if (Number.isNaN(replyId)) {
    return res.status(400).json({ error: 'Invalid reply id' });
  }
  const reply = await dbOperations.forumReplies.findById(replyId);
  if (!reply) {
    return res.status(404).json({ error: 'Reply not found' });
  }
  const ok = await dbOperations.forumReplies.delete(replyId);
  if (!ok) {
    return res.status(404).json({ error: 'Reply not found' });
  }
  res.json({ success: true });
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const statusFilter = req.query.status || '';
  const orders = await dbOperations.orders.findAll(statusFilter);
  res.json(orders);
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (['pending', 'paid', 'completed', 'cancelled'].includes(status)) {
    await dbOperations.orders.updateStatus(parseInt(req.params.id), status);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid status' });
  }
});

app.put('/api/admin/orders/:id/tracking', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { trackingNumber } = req.body || {};
  await dbOperations.orders.updateTrackingNumber(id, trackingNumber ?? '');
  const order = await dbOperations.orders.findById(id);
  res.json({ success: true, order });
});

app.get('/api/orders/:id/tracking', requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const order = await dbOperations.orders.findById(id);
  if (!order || order.userId !== req.session.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const trackingNumber = (order.trackingNumber || '').trim();
  if (!trackingNumber) {
    return res.json({
      trackingNumber: null,
      carrier: 'SF',
      routes: [],
      source: 'none',
      externalUrl: null,
      apiEnabled: false,
    });
  }
  res.json({
    trackingNumber,
    carrier: 'SF',
    routes: [],
    source: 'external',
    externalUrl: 'https://www.sf-express.com/chn/sc/waybill',
    apiEnabled: false,
    message: 'Configure SF API in Laravel for live routes',
  });
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  await dbOperations.orders.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const settings = await getPaymentSettings();
  res.json(settings || {
    network: 'TRC20',
    autoDeleteMinutes: 30,
    txVerifyMaxUnderpayUsdt: 5,
    txVerifyMaxAgeHours: 2,
  });
});

app.put('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const {
    wallet_address,
    network,
    autoDeleteMinutes,
    txVerifyMaxUnderpayUsdt,
    txVerifyMaxAgeHours,
  } = req.body;
  if (!wallet_address || wallet_address.trim() === '') {
    return res.status(400).json({ message: 'Wallet address required' });
  }
  const deleteMinutes = parseInt(autoDeleteMinutes) || 30;
  if (deleteMinutes < 1) {
    return res.status(400).json({ message: 'Auto delete time must be at least 1 minute' });
  }
  const underpay = Math.max(0, parseFloat(txVerifyMaxUnderpayUsdt) || 0);
  const maxAge = Math.max(0, parseInt(txVerifyMaxAgeHours, 10) || 0);
  await dbOperations.paymentSettings.update(
    wallet_address.trim(),
    network || 'TRC20',
    deleteMinutes,
    underpay,
    maxAge
  );
  clearPaymentSettingsCache();
  res.json({ success: true });
});

// ==================== Popup Notices ====================

app.get('/api/popup-notice', async (req, res) => {
  try {
    const notice = await dbOperations.popupNotices.findActive();
    res.json({ notice });
  } catch (error) {
    console.error('[API Error] /api/popup-notice:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/admin/popup-notices', requireAdmin, async (req, res) => {
  try {
    const notices = await dbOperations.popupNotices.findAll();
    res.json({ notices });
  } catch (error) {
    console.error('[API Error] /api/admin/popup-notices:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/admin/popup-notices', requireAdmin, async (req, res) => {
  const { title, content, enabled } = req.body || {};
  try {
    const notice = await dbOperations.popupNotices.create(title, content, enabled !== false);
    if (!notice) return res.status(400).json({ error: 'Invalid input' });
    res.json({ notice });
  } catch (error) {
    console.error('[API Error] POST /api/admin/popup-notices:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/popup-notices/:id', requireAdmin, async (req, res) => {
  const { title, content, enabled } = req.body || {};
  try {
    const notice = await dbOperations.popupNotices.update(req.params.id, title, content, enabled);
    if (!notice) return res.status(404).json({ error: 'Not found or invalid input' });
    res.json({ notice });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/popup-notices/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.delete('/api/admin/popup-notices/:id', requireAdmin, async (req, res) => {
  try {
    await dbOperations.popupNotices.delete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('[API Error] DELETE /api/admin/popup-notices/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

}

module.exports = { registerLegacyMigratedRoutes };
