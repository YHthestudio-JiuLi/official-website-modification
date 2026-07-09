const { parseBridgeToken, BRIDGE_AUD_ADMIN } = require('./bridge-token');

/** 与 Laravel User::canAccessAdmin 对齐：session 直连 Node 时走 Python RPC */
async function canAccessLegacyAdminApiAsync(user, dbOperations) {
  if (!user?.id) return false;
  try {
    return await dbOperations.users.canAccessAdmin(user.id);
  } catch (error) {
    console.error('[canAccessLegacyAdminApi] RPC 失败:', error.message);
    return false;
  }
}

/** 从请求中读取 bridge token 字符串 */
function readBridgeToken(req) {
  return req.headers['x-legacy-node-token'] || req.body?.token || null;
}

/**
 * 解析后台请求上下文
 * - aud=admin bridge token：Laravel 签发前已校验 canAccessAdmin，Node 仅验证用户存在
 * - session：仍走 RPC canAccessAdmin（防历史 session 越权）
 */
async function resolveAdminRequestContext(req, dbOperations) {
  const token = readBridgeToken(req);
  const bridge = parseBridgeToken(token, BRIDGE_AUD_ADMIN);

  if (bridge?.uid) {
    try {
      const user = await dbOperations.users.findById(bridge.uid);
      if (user) {
        return attachScopeFields(user, { bridged: true }, dbOperations);
      }
    } catch (error) {
      console.error('[adminRequestContext] bridge 用户加载失败:', error.message);
    }
  }

  if (req.session?.admin?.id) {
    try {
      const user = await dbOperations.users.findById(req.session.admin.id);
      if (user && (await canAccessLegacyAdminApiAsync(user, dbOperations))) {
        return attachScopeFields(user, { bridged: false }, dbOperations);
      }
    } catch (error) {
      console.error('[adminRequestContext] session 用户加载失败:', error.message);
    }
  }

  return null;
}

/** 将 adminCtx 写入 session 摘要（供 /me 等只读接口使用） */
function toAdminSessionUser(ctx) {
  if (!ctx?.user) return null;
  return {
    id: ctx.user.id,
    username: ctx.user.username,
    email: ctx.user.email,
  };
}

/** 加载代理范围上下文（与 resolveAdminRequestContext 相同，供路由 helper 使用） */
async function loadAgentScopeContext(req, dbOperations) {
  if (req.adminCtx?.user) {
    return req.adminCtx;
  }
  return resolveAdminRequestContext(req, dbOperations);
}

async function attachScopeFields(user, meta, dbOperations) {
  let isScopedAgent = false;
  let scopeCheckFailed = false;
  try {
    isScopedAgent = Boolean(await dbOperations.users.isScopedAgent(user.id));
  } catch (error) {
    console.error('[adminRequestContext] isScopedAgent RPC 失败:', error.message);
    scopeCheckFailed = true;
  }
  return {
    user,
    userId: Number(user.id),
    isScopedAgent,
    scopeCheckFailed,
    ...meta,
  };
}

/** 变更类路由：RPC 不可用时 fail-closed */
function rejectIfScopeCheckFailed(res, ctx) {
  if (ctx?.scopeCheckFailed) {
    res.status(503).json({ error: 'Agent scope check unavailable' });
    return true;
  }
  return false;
}

/** 分片上传会话须与当前管理员一致 */
function denyUnlessChunkSessionOwner(res, ctx, session) {
  const ownerUserId = Number(session?.ownerUserId);
  if (!ownerUserId || ownerUserId !== ctx.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

module.exports = {
  readBridgeToken,
  resolveAdminRequestContext,
  loadAgentScopeContext,
  rejectIfScopeCheckFailed,
  canAccessLegacyAdminApiAsync,
  toAdminSessionUser,
  denyUnlessChunkSessionOwner,
};
