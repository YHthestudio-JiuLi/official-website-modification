const path = require('path');
const fs = require('fs');
const { mapDeviceVerificationRpcError, FINGERPRINT_ALGO_VERSION, FINGERPRINT_HEX_RE } = require('../lib/deviceVerificationErrors');
const { createDeviceArtifactPathResolver, parseBytesRange } = require('../lib/deviceArtifactDownload');
const { createAgentScopeRoute } = require('../lib/agentScopeRoute');
const { registerFirmwareAdminRoutes } = require('./firmwareAdminRoutes');

function registerDeviceRoutes(app, deps) {
  const {
    dbOperations,
    requireAdmin,
    rootDir,
    uploadsPath,
    nanoFirmwareUploadsPath,
    nanoFirmwareChunksPath,
    normalizeUploadFileName,
    normalizeFirmwareRemark,
    buildAttachmentContentDisposition,
    ALLOWED_FIRMWARE_EXTS,
    nanoFirmwareUpload,
    firmwareChunkUpload,
    firmwareChunkSessions,
    cleanupFirmwareChunkSession,
    buildFirmwareStoredName,
    mergeChunkFiles,
    sha256FileHex
  } = deps;

  const agentScope = createAgentScopeRoute(dbOperations);

  const { resolveUploadPathSafely, safeArtifactByteSize } = createDeviceArtifactPathResolver({
    rootDir,
    uploadsPath,
  });

// 设备端鉴权：仅指纹 + 签名（device_id 可变，不参与校验）
function parseFingerprintAuthBody(body) {
  const { fingerprint, issued_at, signature } = body || {};
  if (!fingerprint || typeof fingerprint !== 'string' || typeof signature !== 'string') {
    return { error: 'Invalid request body' };
  }
  const fp = fingerprint.trim().toLowerCase();
  if (!FINGERPRINT_HEX_RE.test(fp)) {
    return { error: 'Invalid fingerprint format' };
  }
  const issuedAt = parseInt(issued_at, 10);
  if (Number.isNaN(issuedAt) || issuedAt < 0) {
    return { error: 'Invalid issued_at' };
  }
  return { fingerprint: fp, issuedAt, signature };
}

function respondDeviceVerificationRpcError(res, error) {
  const mapped = mapDeviceVerificationRpcError(error);
  if (!mapped) {
    return false;
  }
  res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
  return true;
}

// 设备端下载绑定资源（题库数据库/向量索引/固件），使用与验签相同的签名参数鉴权
app.post('/api/device/download/artifact', async (req, res) => {
  const { artifact } = req.body || {};
  if (!artifact || typeof artifact !== 'string') {
    return res.status(400).json({ error: 'Missing artifact' });
  }
  const allowedArtifacts = ['question_db', 'question_vector', 'firmware'];
  if (!allowedArtifacts.includes(artifact)) {
    return res.status(400).json({ error: 'Invalid artifact' });
  }
  const auth = parseFingerprintAuthBody(req.body);
  if (auth.error) {
    return res.status(400).json({ error: auth.error });
  }
  const { fingerprint, issuedAt, signature } = auth;

  try {
    const device = await dbOperations.deviceVerification.authenticateSignedRequest(
      fingerprint,
      signature,
      issuedAt
    );

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
    if (respondDeviceVerificationRpcError(res, error)) {
      return;
    }
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 设备端查询当前绑定关系（题库ID/固件ID），用于本地判断是否需要替换旧资源
app.post('/api/device/binding-status', async (req, res) => {
  const auth = parseFingerprintAuthBody(req.body);
  if (auth.error) {
    return res.status(400).json({ error: auth.error });
  }
  const { fingerprint, issuedAt, signature } = auth;

  try {
    const device = await dbOperations.deviceVerification.authenticateSignedRequest(
      fingerprint,
      signature,
      issuedAt
    );

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
      fingerprint,
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
    if (respondDeviceVerificationRpcError(res, error)) {
      return;
    }
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 设备验证（用户端）：仅指纹 + 密钥对，device_id 不参与查找与签名
app.post('/api/device/verify', async (req, res) => {
  const { fingerprint, fingerprint_algo_version } = req.body || {};
  if (fingerprint === undefined || fingerprint === null || String(fingerprint).trim() === '') {
    return res.status(400).json({ error: 'Invalid fingerprint format' });
  }
  const normalizedFingerprint = String(fingerprint).trim().toLowerCase();
  if (!FINGERPRINT_HEX_RE.test(normalizedFingerprint)) {
    return res.status(400).json({ error: 'Invalid fingerprint format' });
  }
  let normalizedFingerprintAlgoVersion = FINGERPRINT_ALGO_VERSION;
  if (fingerprint_algo_version !== undefined && fingerprint_algo_version !== null && String(fingerprint_algo_version).trim() !== '') {
    normalizedFingerprintAlgoVersion = String(fingerprint_algo_version).trim();
    if (
      normalizedFingerprintAlgoVersion.length > 16 ||
      !/^[A-Za-z0-9._-]+$/.test(normalizedFingerprintAlgoVersion) ||
      normalizedFingerprintAlgoVersion !== FINGERPRINT_ALGO_VERSION
    ) {
      return res.status(400).json({ error: `Unsupported fingerprint_algo_version, expected ${FINGERPRINT_ALGO_VERSION}` });
    }
  }
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  try {
    const result = await dbOperations.deviceVerification.verify(
      normalizedFingerprint,
      ipAddress,
      userAgent,
      normalizedFingerprintAlgoVersion
    );
    res.json(result);
  } catch (error) {
    if (respondDeviceVerificationRpcError(res, error)) {
      return;
    }
    console.error('[API Error] POST /api/device/verify:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 设备端本地验签通过后确认：此时才计入 verification_count
app.post('/api/device/verify-confirm', async (req, res) => {
  const auth = parseFingerprintAuthBody(req.body);
  if (auth.error) {
    return res.status(400).json({ error: auth.error });
  }
  const { fingerprint, issuedAt, signature } = auth;
  try {
    const result = await dbOperations.deviceVerification.confirmVerification(
      fingerprint,
      signature,
      issuedAt
    );
    res.json(result);
  } catch (error) {
    if (respondDeviceVerificationRpcError(res, error)) {
      return;
    }
    console.error('[API Error] POST /api/device/verify-confirm:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 管理端设备验证：全局设置（代理不可访问）
app.get('/api/admin/device-verification/settings', requireAdmin, async (req, res) => {
  try {
    const ctx = await agentScope.requireNonScopedAgent(
      req,
      res,
      'Agents cannot access device verification global settings'
    );
    if (!ctx) {
      return;
    }
    const settings = await dbOperations.deviceVerification.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('[API Error] GET /api/admin/device-verification/settings:', error.message);
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

// 管理端设备验证：全局设置（冷却间隔、平台签名私钥）
app.put('/api/admin/device-verification/settings', requireAdmin, async (req, res) => {
  const ctx = await agentScope.requireNonScopedAgent(
    req,
    res,
    'Agents cannot access device verification global settings'
  );
  if (!ctx) {
    return;
  }
  const raw = req.body?.verify_cooldown_seconds;
  const sec = parseInt(raw, 10);
  if (Number.isNaN(sec) || sec < 0 || sec > 365 * 24 * 3600) {
    return res.status(400).json({ error: 'Invalid verify_cooldown_seconds (0-31536000)' });
  }
  const payload = { verify_cooldown_seconds: sec };
  const signingPrivateKey = req.body?.signing_private_key ?? req.body?.signing_private_key_b64;
  if (typeof signingPrivateKey === 'string' && signingPrivateKey.trim() !== '') {
    payload.signing_private_key = signingPrivateKey;
  }
  try {
    const settings = await dbOperations.deviceVerification.updateSettings(payload);
    res.json({ ok: true, ...settings });
  } catch (error) {
    console.error('[API Error] PUT /api/admin/device-verification/settings:', error.message);
    if (respondDeviceVerificationRpcError(res, error)) {
      return;
    }
    res.status(503).json({ error: 'Database service unavailable' });
  }
});

registerFirmwareAdminRoutes(app, {
  agentScope,
  dbOperations,
  requireAdmin,
  rootDir,
  nanoFirmwareUploadsPath,
  nanoFirmwareChunksPath,
  normalizeUploadFileName,
  normalizeFirmwareRemark,
  ALLOWED_FIRMWARE_EXTS,
  nanoFirmwareUpload,
  firmwareChunkUpload,
  firmwareChunkSessions,
  cleanupFirmwareChunkSession,
  buildFirmwareStoredName,
  mergeChunkFiles,
  sha256FileHex,
  respondDeviceVerificationRpcError,
});

}

module.exports = { registerDeviceRoutes };
