const { loadAgentScopeContext, rejectIfScopeCheckFailed } = require('./adminRequestContext');

/** 代理仅能管理自己创建的资源；非代理无限制 */
function canManageCreatedBy(isScopedAgent, userId, row) {
  if (!isScopedAgent) {
    return true;
  }
  if (!row) {
    return false;
  }
  return Number(row.created_by_user_id || 0) === Number(userId);
}

/** 无权限时返回 404，避免枚举资源 ID */
function denyUnlessCanManage(res, isScopedAgent, userId, row, notFoundMessage = 'Not found') {
  if (canManageCreatedBy(isScopedAgent, userId, row)) {
    return true;
  }
  res.status(404).json({ error: notFoundMessage });
  return false;
}

function denyScopedAgentAction(res, isScopedAgent, message) {
  if (!isScopedAgent) {
    return true;
  }
  res.status(403).json({ error: message });
  return false;
}

/** 代理编辑题库：禁止删改已有文件，仅允许补传缺失项 */
function assertAgentQuestionUpdateAllowed(res, isScopedAgent, question, body, files) {
  if (!isScopedAgent) {
    return true;
  }
  if (body?.clearDbFile === 'true' || body?.clearDbFile === true
    || body?.clearVectorFile === 'true' || body?.clearVectorFile === true) {
    res.status(403).json({ error: 'Agents cannot remove question files' });
    return false;
  }
  const hasDbUpload = Boolean(String(body?.dbChunkUploadId || '').trim() || files?.dbFile?.[0]);
  const hasVectorUpload = Boolean(String(body?.vectorChunkUploadId || '').trim() || files?.vectorFile?.[0]);
  if (hasDbUpload && question?.db_file_path) {
    res.status(403).json({ error: 'Agents cannot replace existing database files' });
    return false;
  }
  if (hasVectorUpload && question?.vector_file_path) {
    res.status(403).json({ error: 'Agents cannot replace existing vector files' });
    return false;
  }
  return true;
}

module.exports = {
  loadAgentScopeContext,
  rejectIfScopeCheckFailed,
  canManageCreatedBy,
  denyUnlessCanManage,
  denyScopedAgentAction,
  assertAgentQuestionUpdateAllowed,
};
