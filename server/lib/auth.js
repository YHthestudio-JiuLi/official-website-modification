const { dbOperations } = require('../../database');
const { verifyLegacyNodeBridgeToken } = require('./bridge-token');
const { saveSession } = require('./session');

function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/** 与 Laravel canAccessAdmin 对齐：超管 / 运营 / 代理 / RBAC admin.access */
function canAccessLegacyAdminApi(user) {
  if (!user) return false;
  if (user.isAdmin === 1 || user.isAdmin === true || user.isAdmin === '1') return true;
  const userType = String(user.user_type || 'customer').toLowerCase();
  return ['agent', 'staff', 'super_admin'].includes(userType);
}

async function canAccessLegacyAdminApiAsync(user) {
  if (canAccessLegacyAdminApi(user)) return true;
  if (!user?.id) return false;
  try {
    return await dbOperations.users.canAccessAdmin(user.id);
  } catch (error) {
    console.error('[canAccessLegacyAdminApi] RPC 失败:', error.message);
    return false;
  }
}

/** 从 bridge token（请求头或 body）解析 legacy 管理员（Cookie 不可用时兜底） */
async function resolveLegacyAdminFromBridge(req) {
  const token = req.headers['x-legacy-node-token'] || req.body?.token;
  const uid = verifyLegacyNodeBridgeToken(token);
  if (!uid) return null;
  try {
    const user = await dbOperations.users.findById(uid);
    if (!user) return null;
    // Laravel 签发的 bridge token 已证明后台访问权限
    return { id: user.id, username: user.username, email: user.email };
  } catch (error) {
    console.error('[resolveLegacyAdminFromBridge] 失败:', error.message);
    return null;
  }
}

/** 解析当前 Node 管理端用户 ID（session 或 bridge token）；权限校验请用 agentDataScope.loadAgentScopeContext */
function resolveLegacyAdminUserId(req) {
  if (req.session?.admin?.id) {
    return req.session.admin.id;
  }
  const token = req.headers['x-legacy-node-token'] || req.body?.token;
  return verifyLegacyNodeBridgeToken(token) || null;
}

/** 尝试写入 session（Cookie 写失败时不阻塞请求） */
async function tryPersistAdminSession(req, admin) {
  if (!admin) return;
  req.session.admin = admin;
  try {
    await saveSession(req);
  } catch (error) {
    console.warn('[session] admin 会话 Cookie 写入失败，已改用 bridge token 鉴权:', error.message);
  }
}

/** 从请求头/body 解析 Laravel bridge token 对应的用户 ID */
function resolveBridgedAdminUserId(req) {
  const token = req.headers['x-legacy-node-token'] || req.body?.token;
  return verifyLegacyNodeBridgeToken(token);
}

async function requireAdmin(req, res, next) {
  const bridgedUid = resolveBridgedAdminUserId(req);

  if (!req.session.admin) {
    const bridged = await resolveLegacyAdminFromBridge(req);
    if (bridged) {
      await tryPersistAdminSession(req, bridged);
    }
  }
  if (!req.session.admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const user = await dbOperations.users.findById(req.session.admin.id);
    if (!user) {
      req.session.admin = null;
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Laravel 已登录并签发 bridge token 时（含代理账号），跳过后台权限重复 RPC 校验
    if (bridgedUid && Number(bridgedUid) === Number(user.id)) {
      return next();
    }
    if (!(await canAccessLegacyAdminApiAsync(user))) {
      req.session.admin = null;
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (error) {
    console.error('[requireAdmin] 校验管理员失败:', error.message);
    return res.status(503).json({ error: 'Database service unavailable' });
  }
}

module.exports = {
  requireUser,
  requireAdmin,
  canAccessLegacyAdminApi,
  canAccessLegacyAdminApiAsync,
  resolveLegacyAdminFromBridge,
  resolveBridgedAdminUserId,
  tryPersistAdminSession,
  resolveLegacyAdminUserId
};
