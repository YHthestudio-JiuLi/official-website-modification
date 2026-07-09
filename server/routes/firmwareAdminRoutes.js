const path = require('path');
const fs = require('fs');
const { deleteFirmwareFileLocally } = require('../lib/firmwareUploadCleanup');

/** 管理端固件 CRUD、本机注册与分片上传 */
function registerFirmwareAdminRoutes(app, deps) {
  const {
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
  } = deps;

  app.get('/api/admin/device-firmwares', requireAdmin, async (req, res) => {
    try {
      const ctx = await agentScope.requireScopeContext(req, res);
      if (!ctx) {
        return;
      }
      const items = await dbOperations.deviceVerification.listFirmwareFiles(
        ctx.isScopedAgent ? ctx.userId : null
      );
      res.json({ items: items || [] });
    } catch (error) {
      console.error('[API Error] GET /api/admin/device-firmwares:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.get('/api/admin/device-firmwares/local-files', requireAdmin, async (req, res) => {
    try {
      const ctx = await agentScope.requireNonScopedAgent(
        req,
        res,
        'Agents cannot list server firmware files'
      );
      if (!ctx) {
        return;
      }
      const items = fs.readdirSync(nanoFirmwareUploadsPath, { withFileTypes: true })
        .filter((ent) => ent.isFile() && !ent.name.startsWith('.'))
        .map((ent) => {
          const abs = path.join(nanoFirmwareUploadsPath, ent.name);
          const st = fs.statSync(abs);
          return {
            file_name: ent.name,
            file_size: st.size || 0,
            modified_at: st.mtime ? st.mtime.toISOString() : null,
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
    const ctx = await agentScope.requireNonScopedAgent(
      req,
      res,
      'Agents cannot register server firmware files'
    );
    if (!ctx) {
      return;
    }

    const fileName = normalizeUploadFileName(String(req.body?.file_name || '').trim());
    if (!fileName || fileName.length > 255 || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file_name' });
    }
    const ext = path.extname(fileName).toLowerCase();
    if (ext && !ALLOWED_FIRMWARE_EXTS.includes(ext)) {
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
        normalizeFirmwareRemark(req.body?.remark),
        ctx.userId
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
    if (ext && !ALLOWED_FIRMWARE_EXTS.includes(ext)) {
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
      updatedAt: Date.now(),
    });
    res.json({
      ok: true,
      uploadId,
      chunkSize: 5 * 1024 * 1024,
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
        totalChunks: session.totalChunks,
      });
    });
  });

  app.post('/api/admin/device-firmwares/upload/complete', requireAdmin, async (req, res) => {
    const scopeCtx = await agentScope.requireScopeContext(req, res);
    if (!scopeCtx) {
      return;
    }

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
      session.fileName !== fileName
      || session.fileSize !== fileSize
      || session.totalChunks !== totalChunks
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
    try {
      await mergeChunkFiles(chunkDir, totalChunks, finalPath);
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
        normalizeFirmwareRemark(req.body?.remark),
        scopeCtx.userId
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
      contentType: req.headers['content-type'] && String(req.headers['content-type']).slice(0, 80),
    });
    nanoFirmwareUpload.single('firmware')(req, res, async (err) => {
      if (err) {
        console.error('[FirmwareUpload] Multer 失败', err.code || '', err.message);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: '固件超过 500MB 上限，请压缩或分包后上传' });
        }
        return res.status(400).json({ error: err.message || 'Firmware upload failed' });
      }
      const scopeCtx = await agentScope.requireScopeContext(req, res);
      if (!scopeCtx) {
        return;
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
          normalizeFirmwareRemark(req.body?.remark),
          scopeCtx.userId
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
      const ctx = await agentScope.requireNonScopedAgent(
        req,
        res,
        'Agents cannot set platform default firmware'
      );
      if (!ctx) {
        return;
      }
      const firmware = await dbOperations.deviceVerification.findFirmwareById(firmwareId);
      if (!firmware) {
        return res.status(404).json({ error: 'Firmware not found' });
      }
      const result = await dbOperations.deviceVerification.setDefaultFirmware(firmwareId);
      res.json({ ok: true, firmware: result });
    } catch (error) {
      if (respondDeviceVerificationRpcError(res, error)) {
        return;
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
      const managed = await agentScope.requireManagedFirmware(req, res, firmwareId);
      if (!managed) {
        return;
      }
      const updated = await dbOperations.deviceVerification.updateFirmwareRemark(
        firmwareId,
        normalizeFirmwareRemark(req.body?.remark)
      );
      res.json({ ok: true, firmware: updated });
    } catch (error) {
      if (respondDeviceVerificationRpcError(res, error)) {
        return;
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
      const managed = await agentScope.requireManagedFirmware(req, res, firmwareId);
      if (!managed) {
        return;
      }
      const removed = await dbOperations.deviceVerification.deleteFirmwareFile(firmwareId);
      if (!removed) {
        return res.status(404).json({ error: 'Firmware not found' });
      }
      // Node（常为 root）删盘，弥补 PHP/Python 权限不足导致的残留
      deleteFirmwareFileLocally(removed, nanoFirmwareUploadsPath, rootDir);
      res.json({ ok: true });
    } catch (error) {
      console.error('[API Error] DELETE /api/admin/device-firmwares/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });
}

module.exports = { registerFirmwareAdminRoutes };
