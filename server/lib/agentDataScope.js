const { verifyLegacyNodeBridgeToken } = require('./bridge-token');
const { canAccessLegacyAdminApiAsync } = require('./auth');

const SCOPED_AGENT_CHECK_FAILED = 'SCOPED_AGENT_CHECK_FAILED';

/**
 * RPC 不可用时的本地回退（与 Laravel AgentDataScope::isScopedAgentFromLocalRoles 语义对齐）
 * 仅依据 users 表字段，无法读取 Spatie 角色时保守返回 false（视为非受限代理）。
 */
function isScopedAgentFromLocalUser(user) {
  if (!user?.id) {
    return false;
  }
  const userType = String(user.user_type || 'customer').toLowerCase();
  if (userType === 'super_admin') {
    return false;
  }
  if (user.isAdmin === 1 || user.isAdmin === true || user.isAdmin === '1') {
    return false;
  }
  return userType === 'agent';
}

/** 与 Laravel AgentDataScope::isScopedAgent 对齐；RPC 失败时回退本地判断 */
async function isScopedAgentUser(dbOperations, user) {
  if (!user?.id) {
    return false;
  }
  try {
    return Boolean(await dbOperations.users.isScopedAgent(user.id));
  } catch (error) {
    console.warn('[agentDataScope] isScopedAgent RPC 失败，回退本地判断:', error.message);
    return isScopedAgentFromLocalUser(user);
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
    if (!user) {
      return null;
    }
    // bridge token 由 Laravel 在 canAccessAdmin 通过后签发，此处不再重复 RPC 权限校验
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
  const isScopedAgent = await isScopedAgentUser(dbOperations, user);
  return {
    user,
    userId: Number(user.id),
    isScopedAgent,
  };
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
