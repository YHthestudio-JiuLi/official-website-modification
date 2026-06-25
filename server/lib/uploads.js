const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline, finished } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');
const multer = require('multer');
const { dbOperations } = require('../../database');
const {
  uploadsPath,
  productUploadsPath,
  questionUploadsPath,
  questionChunksPath,
  nanoFirmwareUploadsPath,
  nanoFirmwareChunksPath
} = require('../config');

const productImageUpload = multer({
  storage: multer.memoryStorage(),
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

/**
 * 将分片顺序合并为最终文件（须等每片完全写入后再写下一片，避免写流死锁挂起）
 */
async function mergeChunkFiles(chunkDir, totalChunks, finalPath) {
  const out = createWriteStream(finalPath, { flags: 'wx' });
  try {
    for (let i = 0; i < totalChunks; i += 1) {
      const partPath = path.join(chunkDir, `chunk_${i}.part`);
      if (!fs.existsSync(partPath)) {
        throw new Error(`Missing chunks: ${i}`);
      }
      await pipeline(createReadStream(partPath), out, { end: false });
    }
    const done = finished(out);
    out.end();
    await done;
  } catch (error) {
    out.destroy();
    throw error;
  }
}

/** @deprecated 使用 mergeChunkFiles */
async function appendChunkFile(outputStream, chunkPath) {
  await pipeline(createReadStream(chunkPath), outputStream, { end: false });
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

/** 固件备注：去首尾空白，最长 500 字符，空则存 null */
function normalizeFirmwareRemark(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return text.slice(0, 500);
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

function parseProductJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function serializeProductDetailJson(body) {
  const toJson = (value) => (Array.isArray(value) ? JSON.stringify(value) : null);
  return {
    featuresJson: toJson(body.featureCards),
    specsJson: toJson(body.specCards),
    usageNoticeJson: toJson(body.usageNoticeLines)
  };
}

function parseProductCategoryId(body) {
  const raw = body?.categoryId;
  if (raw === null || raw === '' || raw === undefined) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseProductSubCategoryId(body) {
  const raw = body?.subCategoryId;
  if (raw === null || raw === '' || raw === undefined) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseCategoryParentId(body) {
  const raw = body?.parentId;
  if (raw === null || raw === '' || raw === undefined) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function normalizeProductRecord(product) {
  if (!product) return product;
  const images = parseProductImages(product.image);
  return {
    ...product,
    images,
    image: images[0] || '',
    featureCards: parseProductJsonArray(product.featureCards ?? product.featuresJson),
    specCards: parseProductJsonArray(product.specCards ?? product.specsJson),
    usageNoticeLines: parseProductJsonArray(product.usageNoticeLines ?? product.usageNoticeJson)
  };
}

async function getUsdtWalletAddress() {
  const settings = await getPaymentSettings();
  return settings ? settings.wallet_address : 'TXYZabcdefghijklmnopqrstuvwxyz123456';
}

function registerUploadCleanupIntervals() {
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
}

module.exports = {
  uploadsPath,
  productUploadsPath,
  questionUploadsPath,
  questionChunksPath,
  nanoFirmwareUploadsPath,
  nanoFirmwareChunksPath,
  productImageUpload,
  questionFilesUpload,
  questionChunkUpload,
  questionChunkSessions,
  questionCompletedUploads,
  QUESTION_CHUNK_EXPIRE_MS,
  buildQuestionStoredName,
  cleanupQuestionChunkSession,
  consumeCompletedQuestionUpload,
  nanoFirmwareUpload,
  firmwareChunkUpload,
  firmwareChunkSessions,
  FIRMWARE_CHUNK_EXPIRE_MS,
  ALLOWED_FIRMWARE_EXTS,
  cleanupFirmwareChunkSession,
  buildFirmwareStoredName,
  mergeChunkFiles,
  appendChunkFile,
  sha256FileHex,
  getPaymentSettings,
  clearPaymentSettingsCache,
  parseProductImages,
  normalizeUploadFileName,
  normalizeFirmwareRemark,
  buildAttachmentContentDisposition,
  parseProductJsonArray,
  serializeProductDetailJson,
  parseProductCategoryId,
  parseProductSubCategoryId,
  parseCategoryParentId,
  normalizeProductRecord,
  getUsdtWalletAddress,
  registerUploadCleanupIntervals
};
