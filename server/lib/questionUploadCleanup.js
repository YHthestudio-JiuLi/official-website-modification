const fs = require('fs');
const path = require('path');

/**
 * 将数据库中的 /uploads/... 路径解析为项目内绝对路径
 */
function resolveStoredUploadPath(stored, rootDir) {
  if (!stored || typeof stored !== 'string') return null;
  const raw = stored.trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    return path.join(rootDir, raw.replace(/^\//, ''));
  }
  if (path.isAbsolute(raw)) return raw;
  return path.join(rootDir, raw.replace(/^\/+/, ''));
}

/**
 * 删除题库在 uploads/questions 下的目录及关联文件（Node 侧，与 Python 双保险）
 */
function deleteQuestionUploadFilesLocally(questionId, question, questionUploadsPath, rootDir) {
  const questionDir = path.join(questionUploadsPath, String(questionId));
  if (fs.existsSync(questionDir)) {
    try {
      fs.rmSync(questionDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('[QuestionUpload] 删除题库目录失败:', questionDir, error.message);
    }
  }

  if (!question || typeof question !== 'object') return;

  for (const field of ['db_file_path', 'vector_file_path']) {
    const abs = resolveStoredUploadPath(question[field], rootDir);
    if (!abs || !fs.existsSync(abs)) continue;
    try {
      fs.unlinkSync(abs);
    } catch (error) {
      console.warn('[QuestionUpload] 删除题库文件失败:', abs, error.message);
    }
  }
}

module.exports = {
  resolveStoredUploadPath,
  deleteQuestionUploadFilesLocally
};
