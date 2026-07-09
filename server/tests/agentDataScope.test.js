const assert = require('assert');
const {
  SCOPED_AGENT_CHECK_FAILED,
  isScopedAgentUser,
  loadAgentScopeContext,
  denyIfScopeCheckFailed,
  canManageCreatedBy,
  denyUnlessCanManage,
  denyScopedAgentAction,
  assertAgentQuestionUpdateAllowed,
} = require('../lib/agentDataScope');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

// canManageCreatedBy
assert.strictEqual(canManageCreatedBy(false, 12, { created_by_user_id: 99 }), true);
assert.strictEqual(canManageCreatedBy(true, 12, { created_by_user_id: 12 }), true);
assert.strictEqual(canManageCreatedBy(true, 12, { created_by_user_id: 99 }), false);
assert.strictEqual(canManageCreatedBy(true, 12, null), false);

// denyUnlessCanManage → 404
{
  const res = mockRes();
  assert.strictEqual(denyUnlessCanManage(res, true, 12, { created_by_user_id: 12 }), true);
  const denied = mockRes();
  assert.strictEqual(denyUnlessCanManage(denied, true, 12, { created_by_user_id: 99 }, 'Firmware not found'), false);
  assert.strictEqual(denied.statusCode, 404);
  assert.strictEqual(denied.body.error, 'Firmware not found');
}

// denyScopedAgentAction → 403
{
  const res = mockRes();
  assert.strictEqual(denyScopedAgentAction(res, false, 'blocked'), true);
  const denied = mockRes();
  assert.strictEqual(denyScopedAgentAction(denied, true, 'Agents cannot register server firmware files'), false);
  assert.strictEqual(denied.statusCode, 403);
}

// denyIfScopeCheckFailed → 503
{
  const res = mockRes();
  assert.strictEqual(denyIfScopeCheckFailed(res, { scopeCheckFailed: true }), false);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(denyIfScopeCheckFailed(mockRes(), { isScopedAgent: false }), true);
}

// isScopedAgentUser RPC 失败时抛错
(async () => {
  const failingDb = {
    users: {
      isScopedAgent: async () => {
        throw new Error('rpc down');
      },
    },
  };
  let threw = false;
  try {
    await isScopedAgentUser(failingDb, { id: 12 });
  } catch (error) {
    threw = true;
    assert.strictEqual(error.code, SCOPED_AGENT_CHECK_FAILED);
  }
  assert.strictEqual(threw, true);

  const req = { session: { admin: { id: 12 } } };
  const dbOperations = {
    users: {
      findById: async () => ({ id: 12, isAdmin: 0 }),
      isScopedAgent: async () => {
        throw new Error('rpc down');
      },
    },
  };
  const auth = require('../lib/auth');
  const original = auth.canAccessLegacyAdminApiAsync;
  auth.canAccessLegacyAdminApiAsync = async () => true;
  try {
    const ctx = await loadAgentScopeContext(req, dbOperations);
    assert.strictEqual(ctx.scopeCheckFailed, true);
    assert.strictEqual(ctx.userId, 12);
    const res = mockRes();
    assert.strictEqual(denyIfScopeCheckFailed(res, ctx), false);
    assert.strictEqual(res.statusCode, 503);
  } finally {
    auth.canAccessLegacyAdminApiAsync = original;
  }
})().then(() => {
  console.log('agentDataScope: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

// assertAgentQuestionUpdateAllowed
{
  const res = mockRes();
  const question = { db_file_path: '/a.db', vector_file_path: null };
  assert.strictEqual(
    assertAgentQuestionUpdateAllowed(res, true, question, { clearDbFile: 'true' }, {}),
    false
  );
  assert.strictEqual(res.statusCode, 403);
}
