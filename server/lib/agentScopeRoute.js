const {
  loadAgentScopeContext,
  rejectIfScopeCheckFailed,
  denyUnlessChunkSessionOwner,
} = require('./adminRequestContext');
const {
  denyUnlessCanManage,
  denyScopedAgentAction,
  assertAgentQuestionUpdateAllowed,
} = require('./agentDataScope');

/**
 * 管理端代理范围路由辅助
 * @param {object} dbOperations
 * @param {{ findQuestionById?: (id: number) => Promise<object|null> }} [catalog]
 */
function createAgentScopeRoute(dbOperations, catalog = {}) {
  const { findQuestionById } = catalog;

  /** 加载上下文；未登录 401，RPC 失败 503 */
  async function requireScopeContext(req, res) {
    const ctx = await loadAgentScopeContext(req, dbOperations);
    if (!ctx?.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    if (rejectIfScopeCheckFailed(res, ctx)) {
      return null;
    }
    return ctx;
  }

  /** 禁止受范围限制的代理执行操作 */
  async function requireNonScopedAgent(req, res, message) {
    const ctx = await requireScopeContext(req, res);
    if (!ctx) {
      return null;
    }
    if (!denyScopedAgentAction(res, ctx.isScopedAgent, message)) {
      return null;
    }
    return ctx;
  }

  /** 按 ID 加载固件并校验代理归属；无权限 404 */
  async function requireManagedFirmware(req, res, firmwareId) {
    const ctx = await requireScopeContext(req, res);
    if (!ctx) {
      return null;
    }
    let firmware;
    try {
      firmware = await dbOperations.deviceVerification.findFirmwareById(firmwareId);
    } catch (error) {
      console.error('[agentScopeRoute] findFirmwareById 失败:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
      return null;
    }
    if (!denyUnlessCanManage(res, ctx.isScopedAgent, ctx.userId, firmware, 'Firmware not found')) {
      return null;
    }
    return { ctx, firmware };
  }

  /** 按 ID 加载题库并校验代理归属；无权限 404 */
  async function requireManagedQuestion(req, res, questionId, notFoundMessage = 'Question not found') {
    const ctx = await requireScopeContext(req, res);
    if (!ctx) {
      return null;
    }
    if (!findQuestionById) {
      res.status(503).json({ error: 'Question catalog unavailable' });
      return null;
    }
    let question;
    try {
      question = await findQuestionById(questionId);
    } catch (error) {
      if (/not found|404/i.test(String(error?.message || ''))) {
        res.status(404).json({ error: notFoundMessage });
        return null;
      }
      console.error('[agentScopeRoute] findQuestionById 失败:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
      return null;
    }
    if (!denyUnlessCanManage(res, ctx.isScopedAgent, ctx.userId, question, notFoundMessage)) {
      return null;
    }
    return { ctx, question };
  }

  /** 代理编辑题库：归属校验 + 文件变更限制 */
  async function requireAgentQuestionUpdate(req, res, questionId, body, files) {
    const managed = await requireManagedQuestion(req, res, questionId);
    if (!managed) {
      return null;
    }
    if (!assertAgentQuestionUpdateAllowed(res, managed.ctx.isScopedAgent, managed.question, body, files)) {
      return null;
    }
    return managed;
  }

  /**
   * 删除题库：代理必须能解析到归属行；管理员 find 失败时仍允许删库+清盘
   * @param {(id: number) => Promise<object|null>} findQuestionById
   */
  async function requireQuestionDeleteAccess(req, res, questionId, findQuestionByIdFn) {
    const ctx = await requireScopeContext(req, res);
    if (!ctx) {
      return null;
    }
    let question = null;
    try {
      question = await findQuestionByIdFn(questionId);
    } catch (error) {
      if (ctx.isScopedAgent) {
        res.status(404).json({ error: 'Question not found' });
        return null;
      }
      // 管理员：find 失败仍允许删库并尝试清盘
    }
    if (question && !denyUnlessCanManage(res, ctx.isScopedAgent, ctx.userId, question, 'Question not found')) {
      return null;
    }
    if (ctx.isScopedAgent && !question) {
      res.status(404).json({ error: 'Question not found' });
      return null;
    }
    return { ctx, question };
  }

  /** 校验分片上传会话归属 */
  function requireChunkSessionOwner(req, res, session) {
    if (!denyUnlessChunkSessionOwner(res, req.adminCtx, session)) {
      return false;
    }
    return true;
  }

  return {
    requireScopeContext,
    requireNonScopedAgent,
    requireManagedFirmware,
    requireManagedQuestion,
    requireAgentQuestionUpdate,
    requireQuestionDeleteAccess,
    requireChunkSessionOwner,
  };
}

module.exports = { createAgentScopeRoute };
