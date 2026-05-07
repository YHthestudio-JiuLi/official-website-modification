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
const multer = require('multer');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const { dbOperations } = require('./database');
const { translateProduct, translateProducts } = require('./translate');
const { createTelegramIntegration, notifyForumNewPost, notifyForumNewReply, canSendTelegramForAdmin, notifyOrderPaid } = require('./telegram');
const { fetchMessagesFromTelegram, getSessionTelegramInfo } = require('./telegram-fetcher');
const questionsService = require('./services/questionsService');

// 加载环境变量
dotenv.config();

const app = express();
// Nginx/宝塔反代会带 X-Forwarded-For；须开启 trust proxy，否则 express-rate-limit 抛 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// 直连本机调试且需避免信任转发头时：环境变量 TRUST_PROXY=false
if (process.env.TRUST_PROXY === 'false' || process.env.TRUST_PROXY === '0') {
  app.set('trust proxy', false);
} else {
  const hops = parseInt(process.env.TRUST_PROXY || '1', 10);
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1);
}
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

// API 通用限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 个请求
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录单独限流，避免被全站轮询流量挤占
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 分钟
  max: 20, // 登录接口单独限制
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 挂载在 /api 下时，不同 Express 版本 req.path 可能是 /admin/... 或 /api/admin/...，用 originalUrl 兜底
function _apiPathNoQuery(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function isAdminApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/admin')) return true;
  const p = String(req.path || '');
  return p.startsWith('/admin/') || p.startsWith('/api/admin/');
}

function isChatApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/chat')) return true;
  return String(req.path || '').startsWith('/chat/');
}

function isAuthApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/auth')) return true;
  return String(req.path || '').startsWith('/auth/');
}

function isDeviceApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/device')) return true;
  return String(req.path || '').startsWith('/device/');
}

// 应用限流中间件到 API 路由（排除登录接口；管理后台全站不参与通用限流，避免列表/轮询触发 429）
// 设备端验签/绑定状态/artifact 多分片下载会在数秒内产生大量 POST，不应占用通用 100/15min 配额导致 429
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/admin/auth/login') {
    return next();
  }
  if (isAdminApiRequest(req)) {
    return next();
  }
  if (isDeviceApiRequest(req)) {
    return next();
  }
  return limiter(req, res, next);
});

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
  if (isChatApiRequest(req) || isAdminApiRequest(req) || isAuthApiRequest(req) || isDeviceApiRequest(req)) {
    return next();
  }
  csrfProtection(req, res, next);
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
const uploadsPath = path.join(__dirname, 'uploads');
const productUploadsPath = path.join(uploadsPath, 'products');

if (!fs.existsSync(productUploadsPath)) {
  fs.mkdirSync(productUploadsPath, { recursive: true });
}

const questionUploadsPath = path.join(uploadsPath, 'questions');
if (!fs.existsSync(questionUploadsPath)) {
  fs.mkdirSync(questionUploadsPath, { recursive: true });
}
const questionChunksPath = path.join(questionUploadsPath, '.chunks');
if (!fs.existsSync(questionChunksPath)) {
  fs.mkdirSync(questionChunksPath, { recursive: true });
}
const nanoFirmwareUploadsPath = path.join(uploadsPath, 'nano-firmwares');
if (!fs.existsSync(nanoFirmwareUploadsPath)) {
  fs.mkdirSync(nanoFirmwareUploadsPath, { recursive: true });
}
const nanoFirmwareChunksPath = path.join(nanoFirmwareUploadsPath, '.chunks');
if (!fs.existsSync(nanoFirmwareChunksPath)) {
  fs.mkdirSync(nanoFirmwareChunksPath, { recursive: true });
}

// 对于静态资源文件（JS、CSS 等），如果文件不存在则返回 404，不回退到 index.html
app.use('/assets', express.static(distPath + '/assets', {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

// 其他静态文件
app.use(express.static(distPath, {
  index: false,
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // 入口 HTML 禁止强缓存，确保每次都能获取到最新的资源 hash
    if (path.extname(filePath).toLowerCase() === '.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 降低前台页面被搜索引擎收录的概率（合规爬虫会参考；恶意爬虫不受约束）
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
});

const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, productUploadsPath);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext) ? ext : '.jpg';
      cb(null, `product_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image files are allowed'));
  }
});

const questionFilesUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, questionUploadsPath);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `question_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`);
    }
  }),
  limits: {
    // 题库向量文件通常较大，放宽到 200MB
    fileSize: 200 * 1024 * 1024
  }
});
const questionChunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = String(req.body?.uploadId || '').trim();
      if (!/^[a-zA-Z0-9_-]{12,80}$/.test(uploadId)) {
        return cb(new Error('Invalid uploadId'));
      }
      const chunkDir = path.join(questionChunksPath, uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      cb(null, chunkDir);
    },
    filename: (req, _file, cb) => {
      const chunkIndex = parseInt(req.body?.chunkIndex, 10);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100000) {
        return cb(new Error('Invalid chunkIndex'));
      }
      cb(null, `chunk_${chunkIndex}.part`);
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});
const questionChunkSessions = new Map();
const questionCompletedUploads = new Map();
const QUESTION_CHUNK_EXPIRE_MS = 6 * 60 * 60 * 1000;

function buildQuestionStoredName(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase() || '.bin';
  return `question_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
}

function cleanupQuestionChunkSession(uploadId) {
  const chunkDir = path.join(questionChunksPath, uploadId);
  questionChunkSessions.delete(uploadId);
  if (fs.existsSync(chunkDir)) {
    fs.rmSync(chunkDir, { recursive: true, force: true });
  }
}

function consumeCompletedQuestionUpload(uploadId, expectedField) {
  const item = questionCompletedUploads.get(uploadId);
  if (!item) return null;
  if (expectedField && item.fileField !== expectedField) return null;
  questionCompletedUploads.delete(uploadId);
  return item;
}

const nanoFirmwareUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, nanoFirmwareUploadsPath);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      const safeExt = ext.replace(/[^a-z0-9.]/g, '') || '.bin';
      cb(null, `nano_firmware_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowExts = ['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.xz', '.bin', '.img', '.deb', '.run', '.txt', '.md', '.json', '.yaml', '.yml'];
    if (allowExts.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported firmware file type'));
  }
});
const firmwareChunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = String(req.body?.uploadId || '').trim();
      if (!/^[a-zA-Z0-9_-]{12,80}$/.test(uploadId)) {
        return cb(new Error('Invalid uploadId'));
      }
      const chunkDir = path.join(nanoFirmwareChunksPath, uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      cb(null, chunkDir);
    },
    filename: (req, _file, cb) => {
      const chunkIndex = parseInt(req.body?.chunkIndex, 10);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100000) {
        return cb(new Error('Invalid chunkIndex'));
      }
      cb(null, `chunk_${chunkIndex}.part`);
    }
  }),
  limits: {
    // 单片 20MB，前端默认 5MB；更小片可以显著降低超时中断概率
    fileSize: 20 * 1024 * 1024
  }
});
const firmwareChunkSessions = new Map();
const FIRMWARE_CHUNK_EXPIRE_MS = 6 * 60 * 60 * 1000;
const ALLOWED_FIRMWARE_EXTS = ['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.xz', '.bin', '.img', '.deb', '.run', '.txt', '.md', '.json', '.yaml', '.yml'];

function cleanupFirmwareChunkSession(uploadId) {
  const chunkDir = path.join(nanoFirmwareChunksPath, uploadId);
  firmwareChunkSessions.delete(uploadId);
  if (fs.existsSync(chunkDir)) {
    fs.rmSync(chunkDir, { recursive: true, force: true });
  }
}

function buildFirmwareStoredName(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const safeExt = ALLOWED_FIRMWARE_EXTS.includes(ext) ? ext : '.bin';
  return `nano_firmware_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`;
}

async function appendChunkFile(outputStream, chunkPath) {
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(chunkPath);
    rs.on('error', reject);
    rs.on('end', resolve);
    rs.pipe(outputStream, { end: false });
  });
}

async function sha256FileHex(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (buf) => hash.update(buf));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

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

function parseProductImages(imageField) {
  if (!imageField) return [];
  if (Array.isArray(imageField)) return imageField.filter(Boolean);
  if (typeof imageField !== 'string') return [];
  const raw = imageField.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_e) {}
  }
  return [raw];
}

function normalizeUploadFileName(name) {
  if (!name || typeof name !== 'string') return '';
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch (_error) {
    return name;
  }
}

function buildAttachmentContentDisposition(name, fallback = 'download.bin') {
  const inputName = normalizeUploadFileName(String(name || '').trim()) || fallback;
  const safeAscii = inputName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/[;\r\n]/g, '_')
    .trim() || fallback;
  const encoded = encodeURIComponent(inputName).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

function normalizeProductRecord(product) {
  if (!product) return product;
  const images = parseProductImages(product.image);
  return {
    ...product,
    images,
    image: images[0] || ''
  };
}

async function getUsdtWalletAddress() {
  const settings = await getPaymentSettings();
  return settings ? settings.wallet_address : 'TXYZabcdefghijklmnopqrstuvwxyz123456';
}

// 定时任务：自动删除超时未支付的订单（直连 DB，避免支付设置 5 分钟缓存导致后台刚改的分钟数迟迟不生效）
setInterval(async () => {
  try {
    const settings = await dbOperations.paymentSettings.get();
    const autoDeleteMinutes = settings != null ? (settings.autoDeleteMinutes ?? 30) : 30;
    const deletedCount = await dbOperations.orders.deleteExpiredPending(autoDeleteMinutes);
    if (deletedCount > 0) {
      console.log(`[Auto Cleanup] Deleted ${deletedCount} expired unpaid orders`);
    }
  } catch (error) {
    console.error('[Auto Cleanup] Error:', error);
  }
}, 60000);

// 定时任务：自动删除 30 分钟内未加入白名单的自动注册设备
setInterval(async () => {
  try {
    const deleted = await dbOperations.deviceVerification.cleanupUnwhitelistedExpired(10);
    if (deleted > 0) {
      console.log(`[Device Whitelist Cleanup] Deleted ${deleted} unwhitelisted devices`);
    }
  } catch (error) {
    console.error('[Device Whitelist Cleanup] Error:', error);
  }
}, 60000);

// 定时清理过期固件分片，避免异常中断后临时文件长期堆积
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, session] of firmwareChunkSessions.entries()) {
    if (!session || (now - (session.updatedAt || session.createdAt || now)) < FIRMWARE_CHUNK_EXPIRE_MS) {
      continue;
    }
    cleanupFirmwareChunkSession(uploadId);
  }
  if (!fs.existsSync(nanoFirmwareChunksPath)) return;
  for (const folder of fs.readdirSync(nanoFirmwareChunksPath)) {
    const abs = path.join(nanoFirmwareChunksPath, folder);
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch (_e) {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if ((now - stat.mtimeMs) > FIRMWARE_CHUNK_EXPIRE_MS) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  }
}, 10 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [uploadId, session] of questionChunkSessions.entries()) {
    if (!session || (now - (session.updatedAt || session.createdAt || now)) < QUESTION_CHUNK_EXPIRE_MS) {
      continue;
    }
    cleanupQuestionChunkSession(uploadId);
  }
  for (const [uploadId, item] of questionCompletedUploads.entries()) {
    if (!item || (now - (item.createdAt || now)) < QUESTION_CHUNK_EXPIRE_MS) {
      continue;
    }
    questionCompletedUploads.delete(uploadId);
    if (item.storedPath && fs.existsSync(item.storedPath)) {
      fs.rmSync(item.storedPath, { force: true });
    }
  }
  if (!fs.existsSync(questionChunksPath)) return;
  for (const folder of fs.readdirSync(questionChunksPath)) {
    const abs = path.join(questionChunksPath, folder);
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch (_e) {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if ((now - stat.mtimeMs) > QUESTION_CHUNK_EXPIRE_MS) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  }
}, 10 * 60 * 1000);

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
  try {
    const user = await dbOperations.users.findById(req.session.admin.id);
    if (!user || !user.isAdmin) {
      req.session.admin = null;
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (error) {
    // Python 后端不可用时避免未捕获异常导致上传无响应或非 JSON
    console.error('[requireAdmin] 校验管理员失败:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }
}

// 敏感上传目录：仅管理员可直链访问，避免被公开爬虫/扫描器直接拉取文件
app.use(
  '/uploads/questions',
  requireAdmin,
  express.static(questionUploadsPath, {
    maxAge: '30d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      const ext = path.extname(filePath).toLowerCase();
      if (['.db', '.sqlite', '.sqlite3', '.index', '.gz', '.zip', '.tar', '.tgz', '.7z', '.rar'].includes(ext)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    }
  })
);
app.use(
  '/uploads/nano-firmwares',
  requireAdmin,
  express.static(nanoFirmwareUploadsPath, {
    maxAge: '30d',
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Content-Disposition', 'attachment');
    }
  })
);

// 上传文件静态访问（排除已在上方单独保护的敏感目录）
app.use(
  '/uploads',
  (req, res, next) => {
    const p = String(req.path || '');
    if (p.startsWith('/questions') || p.startsWith('/nano-firmwares')) {
      return res.status(404).send('Not found');
    }
    return next();
  },
  express.static(uploadsPath, {
    maxAge: '30d',
    etag: true,
    lastModified: true
  })
);

// ==================== 用户认证 API ====================

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
    await dbOperations.orders.updateShippingAddress(id, shippingAddress.trim());
    await dbOperations.orders.updateTxHash(id, txHash.trim());
    await dbOperations.orders.updateStatus(id, 'paid');
    try {
      const updatedOrder = await dbOperations.orders.findById(id);
      if (updatedOrder) {
        notifyOrderPaid(updatedOrder).catch((err) => {
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

app.get('/api/admin/auth/me', (req, res) => {
  if (req.session.admin) {
    res.json({ admin: req.session.admin });
  } else {
    res.status(401).json({ admin: null });
  }
});

app.post('/api/admin/auth/login', loginLimiter, async (req, res) => {
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
  productImageUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image is too large (max 5MB)' });
      }
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({
      ok: true,
      image: imageUrl
    });
  });
});

app.delete('/api/admin/upload/product-image', requireAdmin, (req, res) => {
  const imagePath = req.body?.image || '';
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
  let out = null;
  try {
    out = fs.createWriteStream(finalPath, { flags: 'wx' });
    for (let i = 0; i < totalChunks; i += 1) {
      const partPath = path.join(chunkDir, `chunk_${i}.part`);
      if (!fs.existsSync(partPath)) {
        throw new Error(`Missing chunks: ${i}`);
      }
      await appendChunkFile(out, partPath);
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    const stat = fs.statSync(finalPath);
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

    if (req.files.dbFile && req.files.dbFile[0]) {
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
    
    if (req.files.vectorFile && req.files.vectorFile[0]) {
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
    
    if (req.files.dbFile && req.files.dbFile[0]) {
      try { fs.unlinkSync(req.files.dbFile[0].path); } catch (e) {}
    }
    if (req.files.vectorFile && req.files.vectorFile[0]) {
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
    const useTelegram = adminInfo && canSendTelegramForAdmin(adminInfo);

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

// ==================== 设备验证 API ====================

// 将数据库记录的文件路径解析为 uploads 内的绝对路径，防止路径穿越
function resolveUploadPathSafely(storedPath) {
  let raw = String(storedPath || '').trim().replace(/\\/g, '/');
  if (!raw) throw new Error('empty-path');

  // 兼容历史数据：Python 曾把本机绝对路径写入 SQLite，换机器部署后须截成 /uploads/... 再解析
  if (path.isAbsolute(raw)) {
    const idx = raw.indexOf('/uploads/');
    if (idx !== -1) {
      raw = raw.slice(idx);
    }
  }

  let absPath = '';
  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    absPath = path.join(__dirname, raw.replace(/^\//, ''));
  } else if (path.isAbsolute(raw)) {
    absPath = raw;
  } else {
    absPath = path.join(__dirname, raw);
  }

  const resolved = path.resolve(absPath);
  const uploadsRoot = path.resolve(uploadsPath);
  const relative = path.relative(uploadsRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('path-outside-uploads');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('file-not-found');
  }
  return resolved;
}

/** 设备绑定资源在磁盘上的字节数（供 Jetson 进度条在缺少 Content-Length 时兜底） */
function safeArtifactByteSize(storedPath) {
  try {
    const abs = resolveUploadPathSafely(storedPath);
    const st = fs.statSync(abs);
    return typeof st.size === 'number' && st.size > 0 ? st.size : null;
  } catch (_e) {
    return null;
  }
}

/**
 * 解析 RFC 7233 单区间 Range: bytes=...（不支持 multipart）。
 * 返回 { start, end }（含端点）；不可满足返回 { unsatisfiable: true }；无法解析返回 null。
 */
function parseBytesRange(rangeHeader, fileSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || fileSize <= 0) {
    return null;
  }
  const raw = rangeHeader.trim();
  if (!/^bytes=/i.test(raw)) {
    return null;
  }
  const first = raw.replace(/^bytes=/i, '').split(',')[0].trim();
  const m = /^(\d*)-(\d*)$/.exec(first);
  if (!m) {
    return null;
  }
  let start = m[1] === '' ? null : parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);
  if (start !== null && Number.isNaN(start)) return null;
  if (end !== null && Number.isNaN(end)) return null;

  if (start === null && end === null) {
    return null;
  }
  // 后缀区间：bytes=-500
  if (start === null && end !== null) {
    const suffixLen = end;
    if (suffixLen <= 0) {
      return { unsatisfiable: true };
    }
    if (suffixLen >= fileSize) {
      start = 0;
      end = fileSize - 1;
    } else {
      start = fileSize - suffixLen;
      end = fileSize - 1;
    }
  } else if (start !== null && end === null) {
    end = fileSize - 1;
  }

  if (start < 0 || start >= fileSize) {
    return { unsatisfiable: true };
  }
  if (end < start) {
    return { unsatisfiable: true };
  }
  end = Math.min(end, fileSize - 1);
  return { start, end };
}

// 设备端下载绑定资源（题库数据库/向量索引/固件），使用与验签相同的签名参数鉴权
app.post('/api/device/download/artifact', async (req, res) => {
  const { device_id, issued_at, signature, artifact } = req.body || {};
  if (!artifact || typeof artifact !== 'string') {
    return res.status(400).json({ error: 'Missing artifact' });
  }
  const allowedArtifacts = ['question_db', 'question_vector', 'firmware'];
  if (!allowedArtifacts.includes(artifact)) {
    return res.status(400).json({ error: 'Invalid artifact' });
  }
  if (!device_id || typeof device_id !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const deviceId = device_id.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const issuedAt = parseInt(issued_at, 10);
  if (Number.isNaN(issuedAt) || issuedAt < 0) {
    return res.status(400).json({ error: 'Invalid issued_at' });
  }

  try {
    const verified = await dbOperations.deviceVerification.verifySignature(deviceId, signature, issuedAt);
    if (!verified) {
      return res.status(403).json({ error: 'Signature verification failed' });
    }

    const device = await dbOperations.deviceVerification.findByDeviceId(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    let absFilePath = '';
    let downloadName = 'artifact.bin';

    if (artifact === 'firmware') {
      if (!device.firmware_url) {
        return res.status(404).json({ error: 'No firmware bound to this device' });
      }
      absFilePath = resolveUploadPathSafely(device.firmware_url);
      downloadName = path.basename(device.firmware_name || absFilePath);
    } else {
      if (!device.question_id) {
        return res.status(404).json({ error: 'No question bank bound to this device' });
      }
      const question = await dbOperations.questions.findById(parseInt(device.question_id, 10));
      if (!question) {
        return res.status(404).json({ error: 'Question bank not found' });
      }
      const key = artifact === 'question_db' ? 'db_file_path' : 'vector_file_path';
      if (!question[key]) {
        return res.status(404).json({ error: `No ${key} configured for this question bank` });
      }
      absFilePath = resolveUploadPathSafely(question[key]);
      downloadName = path.basename(absFilePath);
    }

    const stat = fs.statSync(absFilePath);
    const fileSize = stat.size;
    const rawRange = req.headers.range;
    const rangeHeader = typeof rawRange === 'string' ? rawRange.trim() : '';

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', buildAttachmentContentDisposition(downloadName, 'artifact.bin'));
    res.setHeader('Accept-Ranges', 'bytes');

    if (rangeHeader) {
      const rangeParsed = parseBytesRange(rangeHeader, fileSize);
      if (rangeParsed === null) {
        return res.status(400).json({ error: 'Invalid Range header' });
      }
      if (rangeParsed.unsatisfiable) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }
      const { start, end } = rangeParsed;
      const chunkLen = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', String(chunkLen));
      const rs = fs.createReadStream(absFilePath, { start, end });
      rs.on('error', (err) => {
        console.error('[device download] range stream:', err.message);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy(err);
        }
      });
      rs.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(fileSize));
    fs.createReadStream(absFilePath).pipe(res);
  } catch (error) {
    if (error && error.message === 'path-outside-uploads') {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (error && error.message === 'file-not-found') {
      return res.status(404).json({ error: 'File not found on server' });
    }
    if (error && error.message === 'empty-path') {
      return res.status(404).json({ error: 'File path missing' });
    }
    console.error('[API Error] POST /api/device/download/artifact:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 设备端查询当前绑定关系（题库ID/固件ID），用于本地判断是否需要替换旧资源
app.post('/api/device/binding-status', async (req, res) => {
  const { device_id, issued_at, signature } = req.body || {};
  if (!device_id || typeof device_id !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const deviceId = device_id.trim();
  if (!/^[\w.:-]+$/.test(deviceId) || deviceId.length < 4 || deviceId.length > 128) {
    return res.status(400).json({ error: 'Invalid device_id format' });
  }
  const issuedAt = parseInt(issued_at, 10);
  if (Number.isNaN(issuedAt) || issuedAt < 0) {
    return res.status(400).json({ error: 'Invalid issued_at' });
  }

  try {
    const verified = await dbOperations.deviceVerification.verifySignature(deviceId, signature, issuedAt);
    if (!verified) {
      return res.status(403).json({ error: 'Signature verification failed' });
    }

    const device = await dbOperations.deviceVerification.findByDeviceId(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    let question = null;
    if (device.question_id) {
      question = await dbOperations.questions.findById(parseInt(device.question_id, 10));
    }

    let firmwareSizeBytes = null;
    if (device.firmware_url) {
      firmwareSizeBytes = safeArtifactByteSize(device.firmware_url);
    }
    // 磁盘 stat 失败时用库表 file_size，保证客户端能显示总大小与 ETA
    if (firmwareSizeBytes == null && device.firmware_file_size != null) {
      const n = parseInt(device.firmware_file_size, 10);
      if (Number.isFinite(n) && n > 0) {
        firmwareSizeBytes = n;
      }
    }
    let questionDbSizeBytes = null;
    let questionVectorSizeBytes = null;
    if (question && question.db_file_path) {
      questionDbSizeBytes = safeArtifactByteSize(question.db_file_path);
    }
    if (question && question.vector_file_path) {
      questionVectorSizeBytes = safeArtifactByteSize(question.vector_file_path);
    }

    res.json({
      device_id: deviceId,
      question_id: device.question_id || null,
      firmware_id: device.firmware_id || null,
      has_question_db: !!(question && question.db_file_path),
      has_question_vector: !!(question && question.vector_file_path),
      has_firmware: !!device.firmware_url,
      question_db_name: question && question.db_file_path ? path.basename(question.db_file_path) : null,
      question_vector_name: question && question.vector_file_path ? path.basename(question.vector_file_path) : null,
      firmware_name: device.firmware_name || null,
      firmware_checksum_sha256: device.firmware_checksum_sha256 || null,
      // 与磁盘一致；经 Nginx 等代理后下载响应可能无 Content-Length，客户端用此字段估算进度与 ETA
      firmware_size_bytes: firmwareSizeBytes,
      question_db_size_bytes: questionDbSizeBytes,
      question_vector_size_bytes: questionVectorSizeBytes
    });
  } catch (error) {
    console.error('[API Error] POST /api/device/binding-status:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

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
    if (error.message && error.message.includes('not whitelisted')) {
      return res.status(403).json({ error: 'Device not whitelisted; contact administrator.' });
    }
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

// 管理端设备验证：全局设置（防重复消耗间隔）
app.get('/api/admin/device-verification/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await dbOperations.deviceVerification.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('[API Error] GET /api/admin/device-verification/settings:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.put('/api/admin/device-verification/settings', requireAdmin, async (req, res) => {
  const raw = req.body?.verify_cooldown_seconds;
  const sec = parseInt(raw, 10);
  if (Number.isNaN(sec) || sec < 0 || sec > 365 * 24 * 3600) {
    return res.status(400).json({ error: 'Invalid verify_cooldown_seconds (0-31536000)' });
  }
  try {
    const settings = await dbOperations.deviceVerification.updateSettings(sec);
    res.json({ ok: true, ...settings });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/device-verification/settings:', error.message);
    if (error.message && error.message.includes('verify_cooldown_seconds')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/admin/device-firmwares', requireAdmin, async (_req, res) => {
  try {
    const items = await dbOperations.deviceVerification.listFirmwareFiles();
    res.json({ items });
  } catch (error) {
    console.error('[API Error] GET /api/admin/device-firmwares:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.get('/api/admin/device-firmwares/local-files', requireAdmin, (_req, res) => {
  try {
    const items = fs.readdirSync(nanoFirmwareUploadsPath, { withFileTypes: true })
      .filter((ent) => ent.isFile() && !ent.name.startsWith('.'))
      .map((ent) => {
        const abs = path.join(nanoFirmwareUploadsPath, ent.name);
        const st = fs.statSync(abs);
        return {
          file_name: ent.name,
          file_size: st.size || 0,
          modified_at: st.mtime ? st.mtime.toISOString() : null
        };
      })
      .sort((a, b) => {
        const ta = new Date(a.modified_at || 0).getTime();
        const tb = new Date(b.modified_at || 0).getTime();
        return tb - ta;
      });
    res.json({ items });
  } catch (error) {
    console.error('[API Error] GET /api/admin/device-firmwares/local-files:', error.message);
    res.status(500).json({ error: 'Failed to list local firmware files' });
  }
});

app.post('/api/admin/device-firmwares/register-local', requireAdmin, async (req, res) => {
  const fileName = normalizeUploadFileName(String(req.body?.file_name || '').trim());
  if (!fileName || fileName.length > 255 || fileName.includes('/') || fileName.includes('\\')) {
    return res.status(400).json({ error: 'Invalid file_name' });
  }
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_FIRMWARE_EXTS.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported firmware file type' });
  }
  const abs = path.join(nanoFirmwareUploadsPath, fileName);
  if (!abs.startsWith(nanoFirmwareUploadsPath)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: 'File not found on server' });
  }
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) {
      return res.status(400).json({ error: 'Not a regular file' });
    }
    const checksumSha256 = await sha256FileHex(abs);
    const firmware = await dbOperations.deviceVerification.createFirmwareFile(
      fileName,
      `/uploads/nano-firmwares/${fileName}`,
      st.size || 0,
      checksumSha256
    );
    res.json({ ok: true, firmware });
  } catch (error) {
    if (error.message && /unique|duplicate/i.test(error.message)) {
      return res.status(409).json({ error: 'Firmware already registered' });
    }
    console.error('[API Error] POST /api/admin/device-firmwares/register-local:', error.message);
    res.status(500).json({ error: 'Failed to register local firmware file' });
  }
});

app.post('/api/admin/device-firmwares/upload/init', requireAdmin, (req, res) => {
  const fileName = normalizeUploadFileName(String(req.body?.fileName || '').trim());
  const fileSize = parseInt(req.body?.fileSize, 10);
  const totalChunks = parseInt(req.body?.totalChunks, 10);
  if (!fileName || fileName.length > 255) {
    return res.status(400).json({ error: 'Invalid fileName' });
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > 500 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid fileSize' });
  }
  if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 2000) {
    return res.status(400).json({ error: 'Invalid totalChunks' });
  }
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_FIRMWARE_EXTS.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported firmware file type' });
  }
  const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  const chunkDir = path.join(nanoFirmwareChunksPath, uploadId);
  fs.mkdirSync(chunkDir, { recursive: true });
  firmwareChunkSessions.set(uploadId, {
    fileName,
    fileSize,
    totalChunks,
    receivedChunks: new Set(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  res.json({
    ok: true,
    uploadId,
    chunkSize: 5 * 1024 * 1024
  });
});

app.post('/api/admin/device-firmwares/upload/chunk', requireAdmin, (req, res) => {
  firmwareChunkUpload.single('chunk')(req, res, (err) => {
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
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 2000) {
      return res.status(400).json({ error: 'Invalid totalChunks' });
    }
    const session = firmwareChunkSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({ error: 'Upload session expired' });
    }
    if (session.totalChunks !== totalChunks) {
      return res.status(400).json({ error: 'Chunk metadata mismatch' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No chunk uploaded' });
    }
    session.receivedChunks.add(chunkIndex);
    session.updatedAt = Date.now();
    res.json({
      ok: true,
      receivedChunks: session.receivedChunks.size,
      totalChunks: session.totalChunks
    });
  });
});

app.post('/api/admin/device-firmwares/upload/complete', requireAdmin, async (req, res) => {
  const uploadId = String(req.body?.uploadId || '').trim();
  const fileName = normalizeUploadFileName(String(req.body?.fileName || '').trim());
  const fileSize = parseInt(req.body?.fileSize, 10);
  const totalChunks = parseInt(req.body?.totalChunks, 10);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(uploadId)) {
    return res.status(400).json({ error: 'Invalid uploadId' });
  }
  const session = firmwareChunkSessions.get(uploadId);
  if (!session) {
    return res.status(404).json({ error: 'Upload session expired' });
  }
  if (
    session.fileName !== fileName ||
    session.fileSize !== fileSize ||
    session.totalChunks !== totalChunks
  ) {
    cleanupFirmwareChunkSession(uploadId);
    return res.status(400).json({ error: 'Upload metadata mismatch' });
  }
  const chunkDir = path.join(nanoFirmwareChunksPath, uploadId);
  const missingChunks = [];
  for (let i = 0; i < totalChunks; i += 1) {
    const partPath = path.join(chunkDir, `chunk_${i}.part`);
    if (!fs.existsSync(partPath)) {
      missingChunks.push(i);
      if (missingChunks.length >= 5) break;
    }
  }
  if (missingChunks.length > 0) {
    return res.status(400).json({ error: `Missing chunks: ${missingChunks.join(',')}` });
  }

  const storedName = buildFirmwareStoredName(fileName);
  const finalPath = path.join(nanoFirmwareUploadsPath, storedName);
  let out = null;
  try {
    out = fs.createWriteStream(finalPath, { flags: 'wx' });
    for (let i = 0; i < totalChunks; i += 1) {
      const partPath = path.join(chunkDir, `chunk_${i}.part`);
      await appendChunkFile(out, partPath);
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    const stat = fs.statSync(finalPath);
    if (!stat || !stat.size || stat.size <= 0) {
      throw new Error('Merged firmware file is empty');
    }
    if (Number.isInteger(fileSize) && fileSize > 0 && Math.abs(stat.size - fileSize) > 1024) {
      throw new Error('Merged firmware size mismatch');
    }
    const checksumSha256 = await sha256FileHex(finalPath);
    const firmware = await dbOperations.deviceVerification.createFirmwareFile(
      fileName || storedName,
      `/uploads/nano-firmwares/${storedName}`,
      stat.size || 0,
      checksumSha256
    );
    cleanupFirmwareChunkSession(uploadId);
    console.log('[FirmwareUploadChunk] 合并成功', { uploadId, size: stat.size, id: firmware && firmware.id });
    res.json({ ok: true, firmware });
  } catch (error) {
    console.error('[FirmwareUploadChunk] 合并失败', error.message);
    if (fs.existsSync(finalPath)) {
      fs.rmSync(finalPath, { force: true });
    }
    cleanupFirmwareChunkSession(uploadId);
    res.status(500).json({ error: error.message || 'Complete firmware upload failed' });
  }
});

app.post('/api/admin/device-firmwares/upload', requireAdmin, (req, res) => {
  const adminName = req.session && req.session.admin && req.session.admin.username;
  console.log('[FirmwareUpload] 收到请求', {
    admin: adminName,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type'] && String(req.headers['content-type']).slice(0, 80)
  });
  nanoFirmwareUpload.single('firmware')(req, res, async (err) => {
    if (err) {
      console.error('[FirmwareUpload] Multer 失败', err.code || '', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '固件超过 500MB 上限，请压缩或分包后上传' });
      }
      return res.status(400).json({ error: err.message || 'Firmware upload failed' });
    }
    if (!req.file) {
      console.warn('[FirmwareUpload] 未收到文件字段 firmware（请确认表单字段名为 firmware）');
      return res.status(400).json({ error: 'No firmware file uploaded' });
    }
    try {
      const normalizedName = normalizeUploadFileName(req.file.originalname || req.file.filename);
      const checksumSha256 = await sha256FileHex(req.file.path);
      const firmware = await dbOperations.deviceVerification.createFirmwareFile(
        normalizedName || req.file.filename,
        `/uploads/nano-firmwares/${req.file.filename}`,
        req.file.size || 0,
        checksumSha256
      );
      console.log('[FirmwareUpload] 成功', { path: req.file.path, size: req.file.size, id: firmware && firmware.id });
      res.json({ ok: true, firmware });
    } catch (error) {
      console.error('[API Error] POST /api/admin/device-firmwares/upload:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });
});

app.put('/api/admin/device-firmwares/:id/default', requireAdmin, async (req, res) => {
  const firmwareId = parseInt(req.params.id, 10);
  if (Number.isNaN(firmwareId) || firmwareId <= 0) {
    return res.status(400).json({ error: 'Invalid firmware id' });
  }
  try {
    const firmware = await dbOperations.deviceVerification.setDefaultFirmware(firmwareId);
    res.json({ ok: true, firmware });
  } catch (error) {
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Firmware not found' });
    }
    console.error('[API Error] PUT /api/admin/device-firmwares/:id/default:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

app.delete('/api/admin/device-firmwares/:id', requireAdmin, async (req, res) => {
  const firmwareId = parseInt(req.params.id, 10);
  if (Number.isNaN(firmwareId) || firmwareId <= 0) {
    return res.status(400).json({ error: 'Invalid firmware id' });
  }
  try {
    const removed = await dbOperations.deviceVerification.deleteFirmwareFile(firmwareId);
    if (!removed) {
      return res.status(404).json({ error: 'Firmware not found' });
    }
    if (removed.file_url && typeof removed.file_url === 'string' && removed.file_url.startsWith('/uploads/nano-firmwares/')) {
      const abs = path.join(__dirname, removed.file_url.replace(/^\//, ''));
      if (abs.startsWith(nanoFirmwareUploadsPath) && fs.existsSync(abs)) {
        fs.unlinkSync(abs);
      }
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[API Error] DELETE /api/admin/device-firmwares/:id:', error.message);
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
  const { device_id, max_verifications, question_id, firmware_id, is_whitelisted } = req.body || {};
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
  const questionId = question_id ? parseInt(question_id) : null;
  const firmwareId = firmware_id ? parseInt(firmware_id) : null;
  const isWhitelisted = is_whitelisted === undefined ? true : Boolean(is_whitelisted);
  try {
    const device = await dbOperations.deviceVerification.create(deviceId, maxV, questionId, firmwareId, isWhitelisted);
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
  const { max_verifications, add_max_verifications, question_id, firmware_id, is_whitelisted } = req.body || {};
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
    if (question_id !== undefined) {
      const qid = question_id ? parseInt(question_id) : null;
      await dbOperations.deviceVerification.updateQuestionId(deviceId, qid);
    }
    if (firmware_id !== undefined) {
      const fid = firmware_id ? parseInt(firmware_id) : null;
      await dbOperations.deviceVerification.updateFirmwareId(deviceId, fid);
    }
    if (is_whitelisted !== undefined) {
      await dbOperations.deviceVerification.updateWhitelist(deviceId, Boolean(is_whitelisted));
    }
    res.json({
      ok: true,
      device_id: deviceId,
      max_verifications: newMax,
      question_id: question_id !== undefined ? (question_id ? parseInt(question_id) : null) : existing.question_id,
      firmware_id: firmware_id !== undefined ? (firmware_id ? parseInt(firmware_id) : null) : existing.firmware_id,
      is_whitelisted: is_whitelisted !== undefined ? (Boolean(is_whitelisted) ? 1 : 0) : (existing.is_whitelisted || 0)
    });
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distPath, 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      code: 'FILE_TOO_LARGE',
      error: '上传文件过大，题库文件最大支持 200MB'
    });
  }
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      code: 'INVALID_CSRF_TOKEN',
      error: 'Invalid CSRF token'
    });
  }
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