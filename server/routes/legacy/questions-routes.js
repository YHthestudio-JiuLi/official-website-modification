const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const questionsService = require('../../../services/questionsService');
const { deleteQuestionUploadFilesLocally } = require('../../lib/questionUploadCleanup');

function cleanupQuestionTempFiles(files = [], chunkFile = null) {
  for (const file of files) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // 忽略清理失败，避免覆盖主错误
    }
  }
  if (chunkFile?.storedPath) {
    try {
      fs.unlinkSync(chunkFile.storedPath);
    } catch {
      // 忽略清理失败，避免覆盖主错误
    }
  }
}

function cleanupQuestionUploadContext(req, context) {
  cleanupQuestionTempFiles(req.files?.dbFile || [], context?.consumedDbChunk || null);
  cleanupQuestionTempFiles(req.files?.vectorFile || [], context?.consumedVectorChunk || null);
}

function resolveChunkUploads(req, consumeCompletedQuestionUpload) {
  const dbChunkUploadId = String(req.body?.dbChunkUploadId || '').trim();
  const vectorChunkUploadId = String(req.body?.vectorChunkUploadId || '').trim();
  return {
    consumedDbChunk: dbChunkUploadId ? consumeCompletedQuestionUpload(dbChunkUploadId, 'dbFile') : null,
    consumedVectorChunk: vectorChunkUploadId ? consumeCompletedQuestionUpload(vectorChunkUploadId, 'vectorFile') : null,
  };
}

function appendQuestionSourceFile(formData, fieldName, reqFile, chunkFile) {
  if (reqFile) {
    formData.append(fieldName, fs.createReadStream(reqFile.path), {
      filename: reqFile.originalname,
      contentType: reqFile.mimetype,
    });
    return;
  }
  if (chunkFile?.storedPath) {
    formData.append(fieldName, fs.createReadStream(chunkFile.storedPath), {
      filename: chunkFile.originalName || path.basename(chunkFile.storedPath),
    });
  }
}

function buildQuestionFormData(req, options) {
  const { consumeCompletedQuestionUpload, allowClearFlags } = options;
  const formData = new FormData();

  formData.append('name', req.body?.name || req.body?.['name'] || '');
  const categoryName = (req.body?.category_name || req.body?.['category_name'] || '').trim();
  if (categoryName) {
    formData.append('category_name', categoryName);
  }

  if (allowClearFlags) {
    if (req.body.clearDbFile === 'true' || req.body.clearDbFile === true) {
      formData.append('clear_db_file', 'true');
    }
    if (req.body.clearVectorFile === 'true' || req.body.clearVectorFile === true) {
      formData.append('clear_vector_file', 'true');
    }
  }

  const { consumedDbChunk, consumedVectorChunk } = resolveChunkUploads(req, consumeCompletedQuestionUpload);
  appendQuestionSourceFile(formData, 'db_file', req.files?.dbFile?.[0], consumedDbChunk);
  appendQuestionSourceFile(formData, 'vector_file', req.files?.vectorFile?.[0], consumedVectorChunk);

  return { formData, consumedDbChunk, consumedVectorChunk };
}

function registerLegacyQuestionRoutes(app, {
  logger,
  requireAdmin,
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
  normalizeUploadFileName,
  rootDir,
}) {
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
      vectorFile: ['.index'],
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
      updatedAt: Date.now(),
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
        ms: Date.now() - mergeStarted,
      });
      if (!stat || !stat.size || stat.size <= 0) {
        throw new Error('Merged question file is empty');
      }
      questionCompletedUploads.set(uploadId, {
        fileField,
        originalName: fileName,
        storedPath: finalPath,
        createdAt: Date.now(),
      });
      cleanupQuestionChunkSession(uploadId);
      res.json({ ok: true, uploadId });
    } catch (error) {
      console.error('[QuestionUpload] complete 合并失败', {
        uploadId,
        ms: Date.now() - mergeStarted,
        error: error.message,
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
    { name: 'vectorFile', maxCount: 1 },
  ]), async (req, res) => {
    console.log('[Questions] req.body:', req.body);
    console.log('[Questions] req.files:', req.files);
    let formContext = null;

    try {
      formContext = buildQuestionFormData(req, { consumeCompletedQuestionUpload, allowClearFlags: false });
      const result = await questionsService.createWithFiles(formContext.formData);

      res.json({ success: true, id: result.id, dbFilePath: result.db_file_path, vectorFilePath: result.vector_file_path });
    } catch (error) {
      logger.error('Failed to create question:', error);
      res.status(500).json({ error: error.message });
    } finally {
      cleanupQuestionUploadContext(req, formContext);
    }
  });

  app.put('/api/admin/questions/:id', requireAdmin, questionFilesUpload.fields([
    { name: 'dbFile', maxCount: 1 },
    { name: 'vectorFile', maxCount: 1 },
  ]), async (req, res) => {
    let formContext = null;
    try {
      formContext = buildQuestionFormData(req, { consumeCompletedQuestionUpload, allowClearFlags: true });
      const result = await questionsService.updateWithFiles(parseInt(req.params.id), formContext.formData);

      res.json({ success: true, dbFilePath: result.db_file_path, vectorFilePath: result.vector_file_path });
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return res.status(404).json({ error: 'Question not found' });
      }
      logger.error('Failed to update question:', error);
      res.status(500).json({ error: error.message });
    } finally {
      cleanupQuestionUploadContext(req, formContext);
    }
  });

  app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
    const questionId = parseInt(req.params.id, 10);
    if (Number.isNaN(questionId) || questionId <= 0) {
      return res.status(400).json({ error: 'Invalid question id' });
    }
    try {
      let question = null;
      try {
        question = await questionsService.findById(questionId);
      } catch (lookupError) {
        logger.warn('Delete question: findById failed, will still try disk cleanup', {
          questionId,
          error: lookupError.message,
        });
      }

      await questionsService.delete(questionId);
      deleteQuestionUploadFilesLocally(questionId, question, questionUploadsPath, rootDir);
      res.json({ success: true });
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return res.status(404).json({ error: 'Question not found' });
      }
      logger.error('Failed to delete question:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerLegacyQuestionRoutes };
