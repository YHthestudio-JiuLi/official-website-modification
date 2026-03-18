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
const { dbOperations } = require('./database');
const { translateProduct, translateProducts } = require('./translate');

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

// 应用 CSRF 保护中间件到所有 API 路由
app.use('/api', csrfProtection);

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

// 启动服务器
app.listen(PORT, HOST, () => {
  logger.info('API server started', { port: PORT, host: HOST });
  logger.info(`Serving Vue frontend from: ${distPath}`);
  console.log(`API server running on http://${HOST}:${PORT}`);
  console.log(`Serving Vue frontend from: ${distPath}`);
});