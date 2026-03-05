const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const compression = require('compression');
const path = require('path');
const { dbOperations } = require('./database');
const { translateProduct, translateProducts } = require('./translate');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 启用压缩中间件
app.use(compression());

// 中间件配置
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Session 配置
app.use(session({
  secret: 'yhthestudio-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// 静态文件服务 - 提供 Vue 构建后的前端
const clientDistPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDistPath, {
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
  const { productId, quantity = 1 } = req.body;
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
    network: network
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

  const { txHash } = req.body;
  if (txHash && txHash.trim()) {
    await dbOperations.orders.updateTxHash(id, txHash.trim());
    await dbOperations.orders.updateStatus(id, 'paid');
    res.json({ success: true, message: 'Payment successful!' });
  } else {
    res.status(400).json({ error: 'Transaction hash required' });
  }
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

  await dbOperations.forumReplies.create(postId, req.session.user.username, content.trim(), parentReplyIdInt);
  await dbOperations.forumPosts.incrementReplies(postId);
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

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Serving Vue frontend from: ${clientDistPath}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});