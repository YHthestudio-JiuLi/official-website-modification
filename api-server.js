const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const compression = require('compression');
const path = require('path');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const winston = require('winston');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { dbOperations } = require('./database');
const { translateProduct, translateProducts } = require('./translate');
const { createTelegramIntegration, notifyForumNewPost, notifyForumNewReply } = require('./telegram');
const { fetchMessagesFromTelegram, getSessionTelegramInfo } = require('./telegram-fetcher');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-here';

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 配置 Winston 日志
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// 开发环境下同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 启用压缩中间件
app.use(compression());

// API 限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 个请求
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 应用限流中间件到 API 路由
app.use('/api', limiter);

// 中间件配置
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Session 配置
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// CSRF 保护配置（必须在 session 之后）
// 使用 session 存储 CSRF token，而不是 cookie
const csrfProtection = csrf({
  cookie: false,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// 应用 CSRF 保护中间件到所有 API 路由（除了聊天 API、管理员 API 和认证 API）
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/chat/') || req.path.startsWith('/admin/') || req.path.startsWith('/auth/') || req.path.startsWith('/device/')) {
    return next()
  }
  csrfProtection(req, res, next)
});

// 聊天相关状态
const adminTokens = new Set();
const chatSessions = new Map();

// 广播消息到 WebSocket 客户端
function broadcastToChat(sessionId, payload) {
  const msg = JSON.stringify(payload);
  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState !== 1) continue;
      if (client.chatSessionId === sessionId || (client.isAdmin && client.adminSubscribed)) {
        client.send(msg);
      }
    }
  }
}

// Telegram 集成
const telegram = createTelegramIntegration({ broadcastToChat });

// 获取 CSRF token 的端点
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// 静态文件服务 - 提供 Vue 构建后的前端
const distPath = path.join(__dirname, 'dist');

// 对于静态资源文件（JS、CSS 等），如果文件不存在则返回 404，不回退到 index.html
app.use('/assets', express.static(distPath + '/assets', {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

// 其他静态文件
app.use(express.static(distPath, {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

// 支付设置缓存
let paymentSettingsCache = null;
let paymentSettingsCacheTime = 0;
const PAYMENT_SETTINGS_CACHE_TTL = 5 * 60 * 1000;

async function getPaymentSettings() {
  const now = Date.now();
  if (!paymentSettingsCache || (now - paymentSettingsCacheTime) > PAYMENT_SETTINGS_CACHE_TTL) {
    try {
      paymentSettingsCache = await dbOperations.paymentSettings.get();
      paymentSettingsCacheTime = now;
    } catch (error) {
      console.error('[Payment Settings] Failed to fetch:', error.message);
      return null;
    }
  }
  return paymentSettingsCache;
}

function clearPaymentSettingsCache() {
  paymentSettingsCache = null;
  paymentSettingsCacheTime = 0;
}

async function getUsdtWalletAddress() {
  const settings = await getPaymentSettings();
  return settings ? settings.wallet_address : 'TXYZabcdefghijklmnopqrstuvwxyz123456';
}

// 定时任务：自动删除超时未支付的订单
setInterval(async () => {
  try {
    const settings = await getPaymentSettings();
    const autoDeleteMinutes = settings ? (settings.autoDeleteMinutes || 30) : 30;
    const deletedCount = await dbOperations.orders.deleteExpiredPending(autoDeleteMinutes);
    if (deletedCount > 0) {
      console.log(`[Auto Cleanup] Deleted ${deletedCount} expired unpaid orders`);
    }
  } catch (error) {
    console.error('[Auto Cleanup] Error:', error);
  }
}, 60000);

// ==================== 认证中间件 ====================

function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = await dbOperations.users.findById(req.session.admin.id);
  if (!user || !user.isAdmin) {
    req.session.admin = null;
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ==================== 用户认证 API ====================

app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ user: null });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await dbOperations.users.findByUsername(username);

  if (user && await bcrypt.compare(password, user.password)) {
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

app.get('/api/products', async (req, res) => {
  try {
    const products = await dbOperations.products.findAll();
    const translatedProducts = translateProducts(products);
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
    const translatedProduct = translateProduct(product);
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

  const { txHash, shippingAddress } = req.body;
  if (!shippingAddress || !shippingAddress.trim()) {
    return res.status(400).json({ error: 'Shipping address required' });
  }

  if (txHash && txHash.trim()) {
    await dbOperations.orders.updateShippingAddress(id, shippingAddress.trim());
    await dbOperations.orders.updateTxHash(id, txHash.trim());
    await dbOperations.orders.updateStatus(id, 'paid');
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
    res.json(cart);
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

app.get('/api/admin/auth/me', (req, res) => {
  if (req.session.admin) {
    res.json({ admin: req.session.admin });
  } else {
    res.status(401).json({ admin: null });
  }
});

app.post('/api/admin/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await dbOperations.users.findByUsername(username);

  if (user && user.isAdmin && await bcrypt.compare(password, user.password)) {
    req.session.admin = { id: user.id, username: user.username, email: user.email };
    res.json({ admin: req.session.admin });
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
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

  const hashedPassword = await bcrypt.hash(password, 10);
  await dbOperations.users.create(username, email, hashedPassword, parseInt(isAdmin) || 0);
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

  let hashedPassword = null;
  if (password && password.trim() !== '') {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  await dbOperations.users.update(userId, email, hashedPassword, parseInt(isAdmin) || 0);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  await dbOperations.users.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const products = await dbOperations.products.findAll();
  res.json(products);
});

app.get('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const product = await dbOperations.products.findById(parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { name, description, image, date, priceUsdt } = req.body;
  const price = parseFloat(priceUsdt) || 0;
  const productDate = date || new Date().toISOString().split('T')[0];
  await dbOperations.products.create(name, description, image, productDate, price, price);
  res.json({ success: true });
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { name, description, image, date, priceUsdt } = req.body;
  const price = parseFloat(priceUsdt) || 0;
  const productDate = date || new Date().toISOString().split('T')[0];
  await dbOperations.products.update(parseInt(req.params.id), name, description, image, productDate, price, price);
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  await dbOperations.products.delete(parseInt(req.params.id));
  res.json({ success: true });
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

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  await dbOperations.orders.delete(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const settings = await getPaymentSettings();
  res.json(settings || { network: 'TRC20', autoDeleteMinutes: 30 });
});

app.put('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const { wallet_address, network, autoDeleteMinutes } = req.body;
  if (!wallet_address || wallet_address.trim() === '') {
    return res.status(400).json({ message: 'Wallet address required' });
  }
  const deleteMinutes = parseInt(autoDeleteMinutes) || 30;
  if (deleteMinutes < 1) {
    return res.status(400).json({ message: 'Auto delete time must be at least 1 minute' });
  }
  await dbOperations.paymentSettings.update(wallet_address.trim(), network || 'TRC20', deleteMinutes);
  clearPaymentSettingsCache();
  res.json({ success: true });
});

// ==================== 聊天 API ====================

// 获取当前用户的聊天会话
app.get('/api/chat/user-session', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.json({ session: null });
    }
    // 通过用户 ID 查找活跃的聊天会话
    const sessions = await dbOperations.chatSessions.findByUserId(req.session.user.id);
    if (sessions && sessions.length > 0) {
      // 返回最近的活跃会话
      res.json({ session: sessions[0] });
    } else {
      res.json({ session: null });
    }
  } catch (error) {
    console.error('[API Error] /api/chat/user-session:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 获取当前用户的所有聊天会话
app.get('/api/chat/user-sessions', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.json({ sessions: [] });
    }
    const sessions = await dbOperations.chatSessions.findByUserId(req.session.user.id);
    res.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('[API Error] /api/chat/user-sessions:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/chat/admins', async (req, res) => {
  try {
    const admins = await dbOperations.chatAdmins.findAll();
    res.json({ admins });
  } catch (error) {
    console.error('[API Error] /api/chat/admins:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/sessions', async (req, res) => {
  const { nickname, admin_id, service_type, user_id } = req.body || {};
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  const aid = Number(admin_id);
  const stype = service_type || 'support';

  // 如果用户已登录，使用其 user_id
  const uid = (req.session && req.session.user) ? req.session.user.id : (Number(user_id) || null);

  if (!name || name.length < 1) {
    return res.status(400).json({ error: 'Nickname required' });
  }
  if (!Number.isInteger(aid)) {
    return res.status(400).json({ error: 'Invalid admin' });
  }

// 检查是否已有该客服的活跃会话
  if (uid) {
    const existingSession = await dbOperations.chatSessions.findByUserIdAndAdminId(uid, aid);
    if (existingSession) {
      return res.json({ session: existingSession });
    }
  }

  const sessionId = uuidv4();
  try {
    const session = await dbOperations.chatSessions.create(sessionId, name, aid, stype, uid);
    if (!session) {
      return res.status(400).json({ error: 'Could not create session' });
    }
    return res.json({ session });
  } catch (e) {
    console.error('[API Error] POST /api/chat/sessions:', e.message);
    return res.status(500).json({ error: 'Could not create session' });
  }
});

app.get('/api/chat/sessions/:id', async (req, res) => {
  try {
    const session = await dbOperations.chatSessions.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json({ session });
  } catch (error) {
    console.error('[API Error] /api/chat/sessions/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const sid = req.params.id;
    console.log('[Chat] Loading messages for session:', sid);
    
    const session = await dbOperations.chatSessions.findById(sid);
    if (!session) return res.status(404).json({ error: 'Not found' });

    let messages = await dbOperations.chatMessages.findBySessionId(sid);
    if (!messages) messages = [];
    
    console.log('[Chat] Loaded', messages.length, 'messages for session:', sid);

    res.json({ messages, fromTelegram: false });
  } catch (error) {
    console.error('[API Error] /api/chat/sessions/:id/messages:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/sessions/:id/messages', async (req, res) => {
  const { body, sender } = req.body || {};
  const sid = req.params.id;
  try {
    const session = await dbOperations.chatSessions.findById(sid);
    if (!session) return res.status(404).json({ error: 'Not found' });
    let who = 'user';
    if (sender === 'admin') {
      const tok = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!tok || !adminTokens.has(tok)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      who = 'admin';
    }

    console.log('[Debug] POST message body:', body ? body.substring(0, 50) + '...' : 'EMPTY/NULL', 'sender:', sender, 'who:', who);

    // Get admin info for Telegram
    const adminInfo = session.admin_id ? await dbOperations.chatAdmins.findById(session.admin_id) : null;
    const useTelegram = adminInfo && (adminInfo.telegram_token || process.env.TELEGRAM_BOT_TOKEN) &&
      (adminInfo.telegram_chat_id || process.env.TELEGRAM_CHAT_ID);

    // Debug log for Telegram config
    console.log('[Debug] Session:', session.id, 'admin_id:', session.admin_id);
    console.log('[Debug] AdminInfo:', adminInfo ? {
      id: adminInfo.id,
      username: adminInfo.username,
      telegram_chat_id: adminInfo.telegram_chat_id ? 'set' : 'empty',
      telegram_token: adminInfo.telegram_token ? 'set' : 'empty',
      chatbot_enabled: adminInfo.chatbot_enabled
    } : 'null');
    console.log('[Debug] useTelegram:', useTelegram);

    // Validate body first
    const messageBody = String(body || '').trim();
    if (!messageBody) {
      console.log('[Debug] Empty message body rejected');
      return res.status(400).json({ error: 'Empty message' });
    }

// Save message to database first
    console.log('[Chat] Creating message for session:', sid, 'sender:', who);
    const savedMsg = await dbOperations.chatMessages.create(sid, who, messageBody);
    console.log('[Chat] Message saved:', savedMsg ? 'success' : 'failed');

    const row = savedMsg || {
      id: Date.now(),
      session_id: sid,
      sender: who,
      body: messageBody,
      created_at: new Date().toISOString(),
    };

    console.log('[Debug] Created message row:', { id: row.id, body: row.body.substring(0, 50) + '...' });

    const payload = { type: 'message', message: row };
    broadcastToChat(sid, payload);

    // Send to Telegram instead of storing locally
    if (useTelegram) {
      console.log('[Telegram] Sending message to Telegram for session:', session.id, 'sender:', who);
      console.log('[Telegram] row.body:', row.body ? '"' + row.body.substring(0, 100) + '..."' : 'EMPTY/NULL');
      if (who === 'user') {
        console.log('[Telegram] Calling notifyUserMessage with row:', row ? { id: row.id, body: row.body } : 'NULL');
        telegram.notifyUserMessage(session, row, adminInfo).catch((err) => {
          console.error('[Telegram] notify:', err.message || err);
        });
      }
      if (who === 'admin') {
        telegram.notifyAdminReply(session, row, adminInfo).catch((err) => {
          console.error('[Telegram] admin reply:', err.message || err);
        });
      }
    } else {
      console.log('[Telegram] Not sending to Telegram - useTelegram=false');
    }

    res.json({ message: row });
  } catch (error) {
    console.error('[API Error] POST /api/chat/sessions/:id/messages:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/chat/admin/login', (req, res) => {
  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  if (password === ADMIN_PASSWORD) {
    const token = uuidv4();
    adminTokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.get('/api/chat/admin/conversations', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const conversations = await dbOperations.chatSessions.findConversationsForAdmin();
    res.json({ conversations });
  } catch (error) {
    console.error('[API Error] /api/chat/admin/conversations:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// ==================== Admin Chat Settings ====================

app.put('/api/admin/chat-admins/:id', requireAdmin, async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { display_name, bio, avatar_color, telegram_chat_id, telegram_token, chatbot_enabled } = req.body || {};
  if (Number.isNaN(adminId)) {
    return res.status(400).json({ error: 'Invalid admin ID' });
  }
  try {
    await dbOperations.chatAdmins.update(
      adminId,
      display_name,
      bio,
      avatar_color,
      telegram_chat_id,
      telegram_token,
      chatbot_enabled,
    );
    const updated = await dbOperations.chatAdmins.findById(adminId);
    res.json({ admin: updated });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/chat-admins/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/chat-admins/:id/chatbot', requireAdmin, async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  const { enabled } = req.body || {};
  if (Number.isNaN(adminId)) {
    return res.status(400).json({ error: 'Invalid admin ID' });
  }
  try {
    await dbOperations.chatAdmins.updateChatbotEnabled(adminId, Boolean(enabled));
    const updated = await dbOperations.chatAdmins.findById(adminId);
    res.json({ admin: updated });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/chat-admins/:id/chatbot:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
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
    const notice = await dbOperations.popupNotices.update(req.params.id, title, content, enabled !== false);
    if (!notice) return res.status(404).json({ error: 'Not found' });
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

// ==================== 设备验证 API ====================

// 设备验证（用户端）
app.post('/api/device/verify', async (req, res) => {
  const { device_id } = req.body || {};
  if (!device_id || typeof device_id !== 'string' || device_id.trim().length < 4) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const deviceId = device_id.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  try {
    const result = await dbOperations.deviceVerification.verify(deviceId, ipAddress, userAgent);
    res.json(result);
  } catch (error) {
    if (error.message.includes('quota exhausted')) {
      return res.status(403).json({ error: 'Verification quota exhausted; contact administrator.' });
    }
    console.error('[API Error] POST /api/device/verify:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 获取设备公钥（用户端）
app.get('/api/device/:deviceId/public-key', async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  try {
    const publicKey = await dbOperations.deviceVerification.getPublicKey(deviceId);
    if (!publicKey) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ device_id: deviceId, public_key: publicKey });
  } catch (error) {
    console.error('[API Error] GET /api/device/:deviceId/public-key:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 管理端获取设备密钥
app.get('/api/admin/devices/:deviceId/keys', requireAdmin, async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  try {
    const keys = await dbOperations.deviceVerification.getKeys(deviceId);
    if (!keys) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ device_id: deviceId, ...keys });
  } catch (error) {
    console.error('[API Error] GET /api/admin/devices/:deviceId/keys:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 管理端设备验证管理
app.get('/api/admin/devices', requireAdmin, async (req, res) => {
  try {
    const devices = await dbOperations.deviceVerification.findAll();
    res.json({ devices });
  } catch (error) {
    console.error('[API Error] GET /api/admin/devices:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/admin/devices/:id', requireAdmin, async (req, res) => {
  try {
    const device = await dbOperations.deviceVerification.findById(parseInt(req.params.id));
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ device });
  } catch (error) {
    console.error('[API Error] GET /api/admin/devices/:id:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/admin/devices', requireAdmin, async (req, res) => {
  const { device_id, max_verifications } = req.body || {};
  if (!device_id || typeof device_id !== 'string' || device_id.trim().length < 4) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const deviceId = device_id.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const maxV = parseInt(max_verifications) || 10;
  if (maxV < 0 || maxV > 1000000) {
    return res.status(400).json({ error: 'Invalid max_verifications' });
  }
  try {
    const device = await dbOperations.deviceVerification.create(deviceId, maxV);
    res.json({ ok: true, device });
  } catch (error) {
    console.error('[API Error] POST /api/admin/devices:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/devices/:deviceId', requireAdmin, async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const { max_verifications, add_max_verifications } = req.body || {};
  try {
    const existing = await dbOperations.deviceVerification.findByDeviceId(deviceId);
    if (!existing) {
      return res.status(404).json({ error: 'Device not found' });
    }
    let newMax = existing.max_verifications;
    if (max_verifications !== undefined) {
      newMax = parseInt(max_verifications);
    }
    if (add_max_verifications !== undefined) {
      newMax += parseInt(add_max_verifications);
    }
    if (newMax < 0 || newMax > 1000000) {
      return res.status(400).json({ error: 'Invalid max_verifications' });
    }
    await dbOperations.deviceVerification.updateMaxVerifications(deviceId, newMax);
    res.json({ ok: true, device_id: deviceId, max_verifications: newMax });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/devices/:deviceId:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.delete('/api/admin/devices/:deviceId', requireAdmin, async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  try {
    await dbOperations.deviceVerification.delete(deviceId);
    res.json({ ok: true });
  } catch (error) {
    console.error('[API Error] DELETE /api/admin/devices/:deviceId:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.post('/api/admin/devices/:deviceId/reset-count', requireAdmin, async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  try {
    await dbOperations.deviceVerification.resetCount(deviceId);
    res.json({ ok: true });
  } catch (error) {
    console.error('[API Error] POST /api/admin/devices/:deviceId/reset-count:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 获取设备验证日志
app.get('/api/admin/devices/:deviceId/logs', requireAdmin, async (req, res) => {
  const deviceId = req.params.deviceId.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const logs = await dbOperations.deviceVerification.findLogsByDeviceId(deviceId, limit, offset);
    const total = await dbOperations.deviceVerification.countLogsByDeviceId(deviceId);
    res.json({ logs, total });
  } catch (error) {
    console.error('[API Error] GET /api/admin/devices/:deviceId/logs:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 获取所有验证日志
app.get('/api/admin/verification-logs', requireAdmin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const logs = await dbOperations.deviceVerification.findAllLogs(limit, offset);
    const total = await dbOperations.deviceVerification.countAllLogs();
    res.json({ logs, total });
  } catch (error) {
    console.error('[API Error] GET /api/admin/verification-logs:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// ==================== 前端路由回退 ====================
// 所有非 API 请求返回 index.html，让 Vue Router 处理
// 但静态资源文件除外

app.get('*', (req, res) => {
  // 对于静态资源请求，返回 404 而不是 index.html
  if (req.path.startsWith('/assets/') || req.path.startsWith('/dist/assets/')) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack, url: req.url });
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== WebSocket 服务器 ====================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAdmin = false;
  ws.adminSubscribed = false;
  ws.chatSessionId = null;

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (data.type === 'auth') {
      if (data.role === 'admin' && data.token && adminTokens.has(data.token)) {
        ws.isAdmin = true;
        ws.adminSubscribed = true;
        ws.send(JSON.stringify({ type: 'auth_ok', role: 'admin' }));
        return;
      }
      if (data.role === 'user' && data.sessionId) {
        dbOperations.chatSessions.findById(data.sessionId).then((session) => {
          if (session) {
            ws.isAdmin = false;
            ws.chatSessionId = data.sessionId;
            ws.send(JSON.stringify({ type: 'auth_ok', role: 'user' }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_fail' }));
          }
        }).catch(() => {
          ws.send(JSON.stringify({ type: 'auth_fail' }));
        });
        return;
      }
      ws.send(JSON.stringify({ type: 'auth_fail' }));
      return;
    }

    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }
  });

  ws.on('close', () => {
    ws.chatSessionId = null;
  });
});

// ==================== Telegram Webhook ====================

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

app.post('/telegram/webhook', express.json(), (req, res) => {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const q = req.query && req.query.secret;
    if (q !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(403).send('forbidden');
    }
  }
  res.status(200).send('ok');
  telegram.handleUpdate(req.body).catch((err) => {
    console.error('[Telegram] webhook:', err.message || err);
  });
});

// 启动服务器
server.listen(PORT, HOST, () => {
  logger.info('API server started', { port: PORT, host: HOST });
  logger.info(`Serving Vue frontend from: ${distPath}`);
  console.log(`API server running on http://${HOST}:${PORT}`);
  console.log(`WebSocket server running on ws://${HOST}:${PORT}/ws`);
  console.log(`Serving Vue frontend from: ${distPath}`);

  // 启动 Telegram polling（如果启用）
  // startPollingIfEnabled(); // 已改用 setupMultiBotPolling，避免重复
  telegram.setupMultiBotPolling({ broadcastToChat });
});