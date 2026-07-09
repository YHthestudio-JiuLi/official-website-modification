const assert = require('assert');
const {
  isScopedAgentUser,
  resolveRequestAdminUser,
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

function mintTestBridgeToken(uid, secret = 'test-bridge-secret') {
  const crypto = require('crypto');
  const payloadB64 = Buffer.from(JSON.stringify({
    uid,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

// isScopedAgentUser RPC 失败时回退本地判断；bridge token 优先于 session
(async () => {
  process.env.NODE_INTERNAL_SECRET = 'test-bridge-secret';

  const failingDb = {
    users: {
      isScopedAgent: async () => {
        throw new Error('rpc down');
      },
    },
  };
  assert.strictEqual(await isScopedAgentUser(failingDb, { id: 12, user_type: 'agent' }), true);
  assert.strictEqual(await isScopedAgentUser(failingDb, { id: 1, isAdmin: 1, user_type: 'customer' }), false);

  const dbOperations = {
    users: {
      findById: async (id) => (
        Number(id) === 12
          ? { id: 12, user_type: 'customer', isAdmin: 0 }
          : null
      ),
      canAccessAdmin: async () => false,
      isScopedAgent: async () => false,
    },
  };
  const auth = require('../lib/auth');
  const originalCanAccess = auth.canAccessLegacyAdminApiAsync;
  auth.canAccessLegacyAdminApiAsync = async () => false;

  const bridgeTokenValue = mintTestBridgeToken(12);
  const bridgedReq = {
    session: { admin: { id: 12 } },
    headers: { 'x-legacy-node-token': bridgeTokenValue },
  };
  try {
    const user = await resolveRequestAdminUser(bridgedReq, dbOperations);
    assert.strictEqual(user.id, 12);

    const ctx = await loadAgentScopeContext(bridgedReq, dbOperations);
    assert.strictEqual(ctx.isScopedAgent, false);
    assert.strictEqual(ctx.userId, 12);
    assert.strictEqual(denyIfScopeCheckFailed(mockRes(), ctx), true);
  } finally {
    auth.canAccessLegacyAdminApiAsync = originalCanAccess;
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
