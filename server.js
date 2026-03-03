const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const compression = require('compression');
const { dbOperations } = require('./database');
const { i18nMiddleware, setLang } = require('./i18n');
const { translateProduct, translateProducts } = require('./translate');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 启用压缩中间件
app.use(compression());

// 中间件配置
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Cookie 解析（简单实现）
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        req.cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
      }
    });
  }
  next();
});

app.use(session({
  secret: 'yhthestudio-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));

// i18n 中间件
app.use(i18nMiddleware);

// 设置视图引擎（启用缓存以提升性能）
app.engine('ejs', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', true); // 启用视图缓存（生产环境）

// 静态文件（启用缓存和压缩）
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y', // 缓存1年
  etag: true, // 启用ETag
  lastModified: true, // 启用Last-Modified
  setHeaders: (res, path) => {
    // 为CSS和JS文件设置更长的缓存时间
    if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // 为图片设置缓存
    if (path.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// 支付设置缓存（减少数据库查询）
let paymentSettingsCache = null;
let paymentSettingsCacheTime = 0;
const PAYMENT_SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 获取支付设置（带缓存）
async function getPaymentSettings() {
  const now = Date.now();
  if (!paymentSettingsCache || (now - paymentSettingsCacheTime) > PAYMENT_SETTINGS_CACHE_TTL) {
    paymentSettingsCache = await dbOperations.paymentSettings.get();
    paymentSettingsCacheTime = now;
  }
  return paymentSettingsCache;
}

// 清除支付设置缓存（当设置更新时调用）
function clearPaymentSettingsCache() {
  paymentSettingsCache = null;
  paymentSettingsCacheTime = 0;
}

// 定时任务：自动删除超时未支付的订单
setInterval(async () => {
  try {
    const settings = await getPaymentSettings();
    const autoDeleteMinutes = settings ? (settings.autoDeleteMinutes || 30) : 30;
    const deletedCount = await dbOperations.orders.deleteExpiredPending(autoDeleteMinutes);
    if (deletedCount > 0) {
      console.log(`[Auto Cleanup] Deleted ${deletedCount} expired unpaid orders (exceeded ${autoDeleteMinutes} minutes)`);
    }
  } catch (error) {
    console.error('[Auto Cleanup] Error deleting expired orders:', error);
  }
}, 60000); // 每60秒检查一次

// 获取USDT钱包地址（带缓存）
async function getUsdtWalletAddress() {
  const settings = await getPaymentSettings();
  return settings ? settings.wallet_address : 'TXYZabcdefghijklmnopqrstuvwxyz123456';
}

// 管理员认证中间件
async function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  const user = await dbOperations.users.findById(req.session.admin.id);
  if (!user || !user.isAdmin) {
    req.session.admin = null;
    return res.redirect('/admin/login');
  }
  next();
}

// 路由：首页
app.get('/', async (req, res) => {
  const allProducts = await dbOperations.products.findAll();
  const translatedProducts = translateProducts(allProducts.slice(0, 3));
  res.render('index', { user: req.session.user, products: translatedProducts });
});

// 路由：登录页面
app.get('/login', (req, res) => {
  if (req.session.user) {
    const redirect = req.query.redirect || '/';
    return res.redirect(redirect);
  }
  res.render('login', { user: req.session.user, error: null, title: '登录', redirect: req.query.redirect });
});

// 路由：登录处理
app.post('/login', async (req, res) => {
  const { username, password, redirect } = req.body;
  const user = await dbOperations.users.findByUsername(username);

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.redirect(redirect || '/');
  } else {
    res.render('login', { user: null, error: res.t('login.error.invalidCredentials'), title: 'Login', redirect: redirect, t: res.t, lang: res.locals.lang });
  }
});

// 路由：注册页面
app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('register', { user: req.session.user, error: null, title: 'Register' });
});

// 路由：注册处理
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await dbOperations.users.findByUsername(username);
  if (existingUser) {
    return res.render('register', { user: null, error: res.t('register.error.usernameExists'), title: 'Register', t: res.t, lang: res.locals.lang });
  }

  const existingEmail = await dbOperations.users.findByEmail(email);
  if (existingEmail) {
    return res.render('register', { user: null, error: res.t('register.error.emailExists'), title: 'Register', t: res.t, lang: res.locals.lang });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = await dbOperations.users.create(username, email, hashedPassword, 0);

  req.session.user = { id: userId, username, email };
  res.redirect('/');
});

// 路由：登出
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
        res.redirect('/');
    });
});

// 路由：产品页面
app.get('/products', async (req, res) => {
  const products = await dbOperations.products.findAll();
  const translatedProducts = translateProducts(products);
  res.render('products', { user: req.session.user, products: translatedProducts, title: 'Products' });
});

// 路由：产品详情页面
app.get('/products/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const product = await dbOperations.products.findById(id);
  if (!product) {
    return res.redirect('/products');
  }
  const translatedProduct = translateProduct(product);
  res.render('product-detail', { user: req.session.user, product: translatedProduct, title: translatedProduct.name });
});

// 路由：购买页面
app.get('/products/:id/buy', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login?redirect=/products/' + req.params.id + '/buy');
  }
  const id = parseInt(req.params.id);
  const product = await dbOperations.products.findById(id);
  if (!product) {
    return res.redirect('/products');
  }
  const translatedProduct = translateProduct(product);
  let paymentSettings = await getPaymentSettings();
  if (!paymentSettings) {
    paymentSettings = { network: 'TRC20' };
  }
  res.render('buy', { 
    user: req.session.user, 
    product: translatedProduct, 
    paymentSettings: paymentSettings,
    title: 'Buy Product' 
  });
});

// 路由：创建订单
app.post('/orders/create', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
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
  res.redirect('/orders/' + orderId + '/pay');
});

// 路由：支付页面
app.get('/orders/:id/pay', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const id = parseInt(req.params.id);
  const order = await dbOperations.orders.findById(id);
  if (!order || order.userId !== req.session.user.id) {
    return res.redirect('/products');
  }
  // 如果订单没有网络类型，从收款设置中获取
  if (!order.network) {
    const paymentSettings = await getPaymentSettings();
    order.network = paymentSettings ? paymentSettings.network : 'TRC20';
  }
  res.render('payment', { user: req.session.user, order, title: 'Payment Order' });
});

// 路由：确认支付（模拟）
app.post('/orders/:id/confirm-payment', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const id = parseInt(req.params.id);
  const order = await dbOperations.orders.findById(id);
  if (!order || order.userId !== req.session.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  const { txHash } = req.body;
  if (txHash && txHash.trim()) {
    // 在实际应用中，这里应该验证USDT交易
    await dbOperations.orders.updateTxHash(id, txHash.trim());
    await dbOperations.orders.updateStatus(id, 'paid');
    res.json({ success: true, message: 'Payment successful! Order is being processed.' });
  } else {
    res.status(400).json({ error: '请提供交易哈希' });
  }
});

// 路由：我的订单
app.get('/orders', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const userOrders = await dbOperations.orders.findByUserId(req.session.user.id);
  res.render('orders', { user: req.session.user, orders: userOrders, title: 'My Orders' });
});

// 路由：论坛页面
app.get('/forum', async (req, res) => {
  const posts = await dbOperations.forumPosts.findAll();
  res.render('forum', { user: req.session.user, posts, title: 'Forum' });
});

// 路由：论坛发帖
app.get('/forum/post', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.render('forum-post', { user: req.session.user, title: 'New Post' });
});

// 路由：论坛发帖处理
app.post('/forum/post', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  const { title, content } = req.body;
  const date = new Date().toISOString().split('T')[0];
  await dbOperations.forumPosts.create(title, req.session.user.username, content, date, 0);
  res.redirect('/forum');
});

// 路由：帖子详情页（必须在 /forum/post 之后，避免路由冲突）
app.get('/forum/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  // 检查是否是 "post" 字符串（发布新帖路由）
  if (isNaN(id)) {
    return res.redirect('/forum');
  }
  
  const post = await dbOperations.forumPosts.findById(id);
  if (!post) {
    return res.status(404).render('error', { 
      message: 'Post not found', 
      user: req.session.user, 
      title: 'Error' 
    });
  }
  const replies = await dbOperations.forumReplies.findByPostId(id);
  // 将回复组织成树形结构
  const topLevelReplies = replies.filter(r => !r.parentReplyId);
  const childRepliesMap = {};
  replies.forEach(reply => {
    if (reply.parentReplyId) {
      if (!childRepliesMap[reply.parentReplyId]) {
        childRepliesMap[reply.parentReplyId] = [];
      }
      childRepliesMap[reply.parentReplyId].push(reply);
    }
  });
  
  res.render('forum-detail', { 
    user: req.session.user, 
    post, 
    replies, 
    topLevelReplies,
    childRepliesMap,
    title: post.title 
  });
});

// 路由：回复帖子或回复评论
app.post('/forum/:id/reply', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login?redirect=/forum/' + req.params.id);
  }
  const postId = parseInt(req.params.id);
  const { content, parentReplyId } = req.body;
  
  if (!content || content.trim() === '') {
    return res.redirect('/forum/' + postId);
  }
  
  // 如果 parentReplyId 存在，验证该回复是否属于当前帖子
  let parentReplyIdInt = null;
  if (parentReplyId) {
    parentReplyIdInt = parseInt(parentReplyId);
    const parentReply = await dbOperations.forumReplies.findById(parentReplyIdInt);
    if (!parentReply || parentReply.postId !== postId) {
      return res.redirect('/forum/' + postId);
    }
  }
  
  await dbOperations.forumReplies.create(postId, req.session.user.username, content.trim(), parentReplyIdInt);
  res.redirect('/forum/' + postId);
});

// 路由：删除评论
app.post('/forum/:postId/reply/:replyId/delete', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const postId = parseInt(req.params.postId);
  const replyId = parseInt(req.params.replyId);

  const reply = await dbOperations.forumReplies.findById(replyId);
  if (!reply || reply.postId !== postId) {
    return res.redirect('/forum/' + postId);
  }

  // 只有评论作者或管理员可以删除
  if (reply.author !== req.session.user.username && !req.session.admin) {
    return res.redirect('/forum/' + postId);
  }

  await dbOperations.forumReplies.delete(replyId);
  res.redirect('/forum/' + postId);
});


// ==================== 管理后台路由 ====================

// 语言切换路由
app.post('/admin/set-lang', (req, res) => {
  const lang = setLang(req, res);
  // 优先使用表单中的referer，然后是headers中的referer
  let referer = req.body.referer || req.headers.referer || '/admin';
  
  // 处理referer路径
  if (referer) {
    try {
      // 如果是完整URL，提取pathname
      if (referer.startsWith('http://') || referer.startsWith('https://')) {
        const url = new URL(referer);
        referer = url.pathname;
      }
      // 确保是绝对路径
      if (!referer.startsWith('/')) {
        referer = '/admin';
      }
      // 确保是admin路径
      if (!referer.startsWith('/admin')) {
        referer = '/admin';
      }
    } catch (e) {
      referer = '/admin';
    }
  } else {
    referer = '/admin';
  }
  
  res.redirect(referer);
});

app.get('/admin/set-lang', (req, res) => {
  const lang = setLang(req, res);
  let referer = req.query.referer || req.headers.referer || '/admin';
  
  // 处理referer路径
  if (referer) {
    try {
      // 如果是完整URL，提取pathname
      if (referer.startsWith('http://') || referer.startsWith('https://')) {
        const url = new URL(referer);
        referer = url.pathname;
      }
      // 确保是绝对路径
      if (!referer.startsWith('/')) {
        referer = '/admin';
      }
      // 确保是admin路径
      if (!referer.startsWith('/admin')) {
        referer = '/admin';
      }
    } catch (e) {
      referer = '/admin';
    }
  } else {
    referer = '/admin';
  }
  
  res.redirect(referer);
});

// 管理后台登录页面
app.get('/admin/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: null, t: res.t, lang: res.locals.lang });
});

// 管理后台登录处理
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await dbOperations.users.findByUsername(username);
  
  if (user && user.isAdmin && await bcrypt.compare(password, user.password)) {
    req.session.admin = { id: user.id, username: user.username, email: user.email };
    res.redirect('/admin');
  } else {
    res.render('admin/login', { 
      error: res.t('admin.login.error') || 'Username or password incorrect', 
      t: res.t, 
      lang: res.locals.lang 
    });
  }
});

// 管理后台登出
app.get('/admin/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
});

// 管理后台首页（仪表板）
app.get('/admin', requireAdmin, async (req, res) => {
  const users = await dbOperations.users.findAll();
  const products = await dbOperations.products.findAll();
  const posts = await dbOperations.forumPosts.findAll();
  const orderStats = await dbOperations.orders.getStats();
  
  const stats = {
    totalUsers: users.length,
    totalProducts: products.length,
    totalPosts: posts.length,
    totalOrders: orderStats.total,
    pendingOrders: orderStats.pending,
    totalRevenue: orderStats.revenue
  };
  res.render('admin/dashboard', { admin: req.session.admin, stats, t: res.t, lang: res.locals.lang });
});

// 用户管理 - 列表
app.get('/admin/users', requireAdmin, async (req, res) => {
  const users = await dbOperations.users.findAll();
  res.render('admin/users', { admin: req.session.admin, users, t: res.t, lang: res.locals.lang });
});

// 用户管理 - 编辑页面
app.get('/admin/users/edit/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = await dbOperations.users.findById(id);
  if (!user) {
    return res.redirect('/admin/users');
  }
  res.render('admin/user-form', { admin: req.session.admin, user, t: res.t, lang: res.locals.lang });
});

// 用户管理 - 保存（添加/更新）
app.post('/admin/users/save', requireAdmin, async (req, res) => {
  const { id, username, email, password, isAdmin } = req.body;
  
  if (id) {
    // 更新用户
    const userId = parseInt(id);
    const user = await dbOperations.users.findById(userId);
    if (!user) {
      return res.redirect('/admin/users');
    }
    
    // 检查邮箱是否被其他用户使用
    const existingUser = await dbOperations.users.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      return res.render('admin/user-form', {
        admin: req.session.admin,
        user,
        error: 'This email is already used by another user',
        t: res.t,
        lang: res.locals.lang
      });
    }
    
    let hashedPassword = null;
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }
    
    await dbOperations.users.update(userId, email, hashedPassword, parseInt(isAdmin) || 0);
  } else {
    // 添加新用户
    if (!username || !email || !password) {
      return res.render('admin/user-form', {
        admin: req.session.admin,
        user: null,
        error: 'Please fill in all required fields',
        t: res.t,
        lang: res.locals.lang
      });
    }

    // 检查用户名是否已存在
    const existingUsername = await dbOperations.users.findByUsername(username);
    if (existingUsername) {
      return res.render('admin/user-form', {
        admin: req.session.admin,
        user: null,
        error: 'Username already exists',
        t: res.t,
        lang: res.locals.lang
      });
    }

    // 检查邮箱是否已存在
    const existingEmail = await dbOperations.users.findByEmail(email);
    if (existingEmail) {
      return res.render('admin/user-form', {
        admin: req.session.admin,
        user: null,
        error: 'Email already in use',
        t: res.t,
        lang: res.locals.lang
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await dbOperations.users.create(username, email, hashedPassword, parseInt(isAdmin) || 0);
  }
  
  res.redirect('/admin/users');
});

// 用户管理 - 删除
app.post('/admin/users/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await dbOperations.users.delete(id);
  res.redirect('/admin/users');
});

// 产品管理 - 列表
app.get('/admin/products', requireAdmin, async (req, res) => {
  const products = await dbOperations.products.findAll();
  res.render('admin/products', { admin: req.session.admin, products, t: res.t, lang: res.locals.lang });
});

// 产品管理 - 添加页面
app.get('/admin/products/add', requireAdmin, (req, res) => {
  res.render('admin/product-form', { admin: req.session.admin, product: null, t: res.t, lang: res.locals.lang });
});

// 产品管理 - 编辑页面
app.get('/admin/products/edit/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const product = await dbOperations.products.findById(id);
  if (!product) {
    return res.redirect('/admin/products');
  }
  res.render('admin/product-form', { admin: req.session.admin, product, t: res.t, lang: res.locals.lang });
});

// 产品管理 - 保存（添加/更新）
app.post('/admin/products/save', requireAdmin, async (req, res) => {
  const { id, name, description, image, date, priceUsdt } = req.body;
  const price = parseFloat(priceUsdt) || 0;
  const productDate = date || new Date().toISOString().split('T')[0];
  
  if (id) {
    // 更新
    await dbOperations.products.update(parseInt(id), name, description, image, productDate, price, price);
  } else {
    // 添加
    await dbOperations.products.create(name, description, image, productDate, price, price);
  }
  res.redirect('/admin/products');
});

// 产品管理 - 删除
app.post('/admin/products/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await dbOperations.products.delete(id);
  res.redirect('/admin/products');
});

// 论坛管理 - 列表
app.get('/admin/posts', requireAdmin, async (req, res) => {
  const posts = await dbOperations.forumPosts.findAll();
  res.render('admin/posts', { admin: req.session.admin, posts, t: res.t, lang: res.locals.lang });
});

// 论坛管理 - 添加页面
app.get('/admin/posts/add', requireAdmin, (req, res) => {
  res.render('admin/post-form', { admin: req.session.admin, post: null, t: res.t, lang: res.locals.lang });
});

// 论坛管理 - 编辑页面
app.get('/admin/posts/edit/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const post = await dbOperations.forumPosts.findById(id);
  if (!post) {
    return res.redirect('/admin/posts');
  }
  res.render('admin/post-form', { admin: req.session.admin, post, t: res.t, lang: res.locals.lang });
});

// 论坛管理 - 保存（添加/更新）
app.post('/admin/posts/save', requireAdmin, async (req, res) => {
  const { id, title, content, author, date, replies } = req.body;
  const postDate = date || new Date().toISOString().split('T')[0];
  const replyCount = parseInt(replies) || 0;
  const postAuthor = author || 'Admin';
  
  if (id) {
    // 更新
    await dbOperations.forumPosts.update(parseInt(id), title, postAuthor, content, postDate, replyCount);
  } else {
    // 添加
    await dbOperations.forumPosts.create(title, postAuthor, content, postDate, replyCount);
  }
  res.redirect('/admin/posts');
});

// 论坛管理 - 置顶/取消置顶
app.post('/admin/posts/pin/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await dbOperations.forumPosts.togglePin(id);
  res.redirect('/admin/posts');
});

// 论坛管理 - 删除
app.post('/admin/posts/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await dbOperations.forumPosts.delete(id);
  res.redirect('/admin/posts');
});


// 订单管理 - 列表
app.get('/admin/orders', requireAdmin, async (req, res) => {
  const statusFilter = req.query.status || '';
  const orders = await dbOperations.orders.findAll(statusFilter);
  res.render('admin/orders', { 
    admin: req.session.admin, 
    orders, 
    statusFilter,
    title: 'Order Management', 
    currentPage: 'orders',
    t: res.t,
    lang: res.locals.lang
  });
});

// 订单管理 - 删除（必须在状态更新之前，避免路由冲突）
app.post('/admin/orders/:id/delete', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await dbOperations.orders.delete(id);
    console.log(`Order #${id} deleted`);
  } catch (error) {
    console.error('Failed to delete order:', error);
  }
  res.redirect('/admin/orders');
});

// 订单管理 - 更新状态
app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (['pending', 'paid', 'completed', 'cancelled'].includes(status)) {
    await dbOperations.orders.updateStatus(id, status);
  }
  res.redirect('/admin/orders');
});

// 收款设置 - 显示页面
app.get('/admin/payment-settings', requireAdmin, async (req, res) => {
  const settings = await getPaymentSettings();
  res.render('admin/payment-settings', { 
    admin: req.session.admin, 
    settings, 
    title: '收款设置', 
    currentPage: 'payment-settings',
    t: res.t,
    lang: res.locals.lang
  });
});

// 收款设置 - 保存
app.post('/admin/payment-settings', requireAdmin, async (req, res) => {
  const { wallet_address, network, autoDeleteMinutes } = req.body;
  if (!wallet_address || wallet_address.trim() === '') {
    const settings = await getPaymentSettings();
    return res.render('admin/payment-settings', {
      admin: req.session.admin,
      settings,
      title: 'Payment Settings',
      currentPage: 'payment-settings',
      error: 'Wallet address cannot be empty'
    });
  }
  const deleteMinutes = parseInt(autoDeleteMinutes) || 30;
  if (deleteMinutes < 1) {
    const settings = await getPaymentSettings();
    return res.render('admin/payment-settings', {
      admin: req.session.admin,
      settings,
      title: '收款设置',
      currentPage: 'payment-settings',
      error: 'Auto delete time must be greater than 0 minutes'
    });
  }
  await dbOperations.paymentSettings.update(wallet_address.trim(), network || 'TRC20', deleteMinutes);
  clearPaymentSettingsCache(); // 清除缓存
  res.redirect('/admin/payment-settings');
});

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

