const path = require('path');
const fs = require('fs');

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
    appendChunkFile,
    sha256FileHex
  } = deps;

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
    absPath = path.join(rootDir, raw.replace(/^\//, ''));
  } else if (path.isAbsolute(raw)) {
    absPath = raw;
  } else {
    absPath = path.join(rootDir, raw);
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
      checksumSha256,
      normalizeFirmwareRemark(req.body?.remark)
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
      checksumSha256,
      normalizeFirmwareRemark(req.body?.remark)
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
        checksumSha256,
        normalizeFirmwareRemark(req.body?.remark)
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

app.put('/api/admin/device-firmwares/:id/remark', requireAdmin, async (req, res) => {
  const firmwareId = parseInt(req.params.id, 10);
  if (Number.isNaN(firmwareId) || firmwareId <= 0) {
    return res.status(400).json({ error: 'Invalid firmware id' });
  }
  try {
    const firmware = await dbOperations.deviceVerification.updateFirmwareRemark(
      firmwareId,
      normalizeFirmwareRemark(req.body?.remark)
    );
    res.json({ ok: true, firmware });
  } catch (error) {
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Firmware not found' });
    }
    console.error('[API Error] PUT /api/admin/device-firmwares/:id/remark:', error.message);
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
      const abs = path.join(rootDir, removed.file_url.replace(/^\//, ''));
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

}

module.exports = { registerDeviceRoutes };
