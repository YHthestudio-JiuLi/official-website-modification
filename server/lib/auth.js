const { dbOperations } = require('../../database');
const {
  parseBridgeToken,
  verifyLegacyNodeBridgeToken,
  BRIDGE_AUD_ADMIN,
  BRIDGE_AUD_USER,
} = require('./bridge-token');
const { saveSession } = require('./session');
const {
  resolveAdminRequestContext,
  canAccessLegacyAdminApiAsync: canAccessAdminRpc,
} = require('./adminRequestContext');

function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/** 与 Laravel User::canAccessAdmin 对齐：统一走 Python RPC */
async function canAccessLegacyAdminApiAsync(user) {
  return canAccessAdminRpc(user, dbOperations);
}

/** 解析当前 Node 管理端用户 ID（session 或 aud=admin bridge token） */
function resolveLegacyAdminUserId(req) {
  if (req.session?.admin?.id) {
    return req.session.admin.id;
  }
  return verifyLegacyNodeBridgeToken(
    req.headers['x-legacy-node-token'] || req.body?.token,
    BRIDGE_AUD_ADMIN
  ) || null;
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

async function requireAdmin(req, res, next) {
  const ctx = await resolveAdminRequestContext(req, dbOperations);
  if (!ctx?.user) {
    req.session.admin = null;
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!req.session.admin) {
    await tryPersistAdminSession(req, {
      id: ctx.user.id,
      username: ctx.user.username,
      email: ctx.user.email,
    });
  }

  req.adminCtx = ctx;
  next();
}

module.exports = {
  requireUser,
  requireAdmin,
  canAccessLegacyAdminApiAsync,
  tryPersistAdminSession,
  resolveLegacyAdminUserId,
  BRIDGE_AUD_ADMIN,
  BRIDGE_AUD_USER,
  parseBridgeToken,
};
