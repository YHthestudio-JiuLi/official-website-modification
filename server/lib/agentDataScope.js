const { verifyLegacyNodeBridgeToken } = require('./bridge-token');
const { canAccessLegacyAdminApiAsync } = require('./auth');

const SCOPED_AGENT_CHECK_FAILED = 'SCOPED_AGENT_CHECK_FAILED';

/** 与 Laravel AgentDataScope::isScopedAgent 对齐；RPC 失败时抛错（fail-closed） */
async function isScopedAgentUser(dbOperations, user) {
  if (!user?.id) {
    return false;
  }
  try {
    return Boolean(await dbOperations.users.isScopedAgent(user.id));
  } catch (error) {
    console.error('[agentDataScope] isScopedAgent RPC 失败:', error.message);
    const scopeError = new Error('Agent scope check unavailable');
    scopeError.code = SCOPED_AGENT_CHECK_FAILED;
    throw scopeError;
  }
}

/** 解析当前管理端用户（session 或 bridge token，含角色校验） */
async function resolveRequestAdminUser(req, dbOperations) {
  if (req.session?.admin?.id) {
    try {
      const user = await dbOperations.users.findById(req.session.admin.id);
      if (user && (await canAccessLegacyAdminApiAsync(user))) {
        return user;
      }
    } catch (error) {
      console.error('[agentDataScope] session 用户加载失败:', error.message);
    }
  }

  const token = req.headers['x-legacy-node-token'] || req.body?.token;
  const uid = verifyLegacyNodeBridgeToken(token);
  if (!uid) {
    return null;
  }
  try {
    const user = await dbOperations.users.findById(uid);
    if (!user || !(await canAccessLegacyAdminApiAsync(user))) {
      return null;
    }
    return user;
  } catch (error) {
    console.error('[agentDataScope] bridge 用户加载失败:', error.message);
    return null;
  }
}

async function loadAgentScopeContext(req, dbOperations) {
  const user = await resolveRequestAdminUser(req, dbOperations);
  if (!user) {
    return null;
  }
  try {
    const isScopedAgent = await isScopedAgentUser(dbOperations, user);
    return {
      user,
      userId: Number(user.id),
      isScopedAgent,
    };
  } catch (error) {
    if (error.code === SCOPED_AGENT_CHECK_FAILED) {
      return {
        user,
        userId: Number(user.id),
        scopeCheckFailed: true,
      };
    }
    throw error;
  }
}

/** RPC 不可用时拒绝变更（fail-closed） */
function denyIfScopeCheckFailed(res, ctx) {
  if (ctx?.scopeCheckFailed) {
    res.status(503).json({ error: 'Agent scope check unavailable' });
    return false;
  }
  return true;
}

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
  SCOPED_AGENT_CHECK_FAILED,
  isScopedAgentUser,
  resolveRequestAdminUser,
  loadAgentScopeContext,
  denyIfScopeCheckFailed,
  canManageCreatedBy,
  denyUnlessCanManage,
  denyScopedAgentAction,
  assertAgentQuestionUpdateAllowed,
};
