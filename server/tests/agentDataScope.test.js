const assert = require('assert');
const crypto = require('crypto');
const {
  canManageCreatedBy,
  assertAgentQuestionUpdateAllowed,
} = require('../lib/agentDataScope');
const {
  resolveAdminRequestContext,
  rejectIfScopeCheckFailed,
  denyUnlessChunkSessionOwner,
} = require('../lib/adminRequestContext');
const { BRIDGE_AUD_ADMIN } = require('../lib/bridge-token');

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

function mintTestBridgeToken(uid, aud = BRIDGE_AUD_ADMIN, secret = 'test-bridge-secret') {
  const payloadB64 = Buffer.from(JSON.stringify({
    uid,
    aud,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

assert.strictEqual(canManageCreatedBy(false, 12, { created_by_user_id: 99 }), true);
assert.strictEqual(canManageCreatedBy(true, 12, { created_by_user_id: 12 }), true);
assert.strictEqual(canManageCreatedBy(true, 12, { created_by_user_id: 99 }), false);

{
  const res = mockRes();
  assert.strictEqual(rejectIfScopeCheckFailed(res, { scopeCheckFailed: true }), true);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(rejectIfScopeCheckFailed(mockRes(), { isScopedAgent: false }), false);
}

(async () => {
  process.env.NODE_INTERNAL_SECRET = 'test-bridge-secret';

  const dbOperations = {
    users: {
      findById: async (id) => (
        Number(id) === 12
          ? { id: 12, user_type: 'agent', isAdmin: 0 }
          : null
      ),
      isScopedAgent: async () => true,
      canAccessAdmin: async () => true,
    },
  };

  const adminBridgeReq = {
    session: {},
    headers: { 'x-legacy-node-token': mintTestBridgeToken(12) },
  };
  const ctx = await resolveAdminRequestContext(adminBridgeReq, dbOperations);
  assert.strictEqual(ctx.userId, 12);
  assert.strictEqual(ctx.isScopedAgent, true);
  assert.strictEqual(ctx.bridged, true);

  const userBridgeReq = {
    session: {},
    headers: { 'x-legacy-node-token': mintTestBridgeToken(12, 'user') },
  };
  assert.strictEqual(await resolveAdminRequestContext(userBridgeReq, dbOperations), null);

  const failDb = {
    users: {
      findById: async () => ({ id: 12, user_type: 'agent', isAdmin: 0 }),
      isScopedAgent: async () => {
        throw new Error('rpc down');
      },
      canAccessAdmin: async () => true,
    },
  };
  const failCtx = await resolveAdminRequestContext(adminBridgeReq, failDb);
  assert.strictEqual(failCtx.scopeCheckFailed, false);
  assert.strictEqual(failCtx.isScopedAgent, true);
  const res = mockRes();
  assert.strictEqual(rejectIfScopeCheckFailed(res, failCtx), false);

  const chunkRes = mockRes();
  assert.strictEqual(
    denyUnlessChunkSessionOwner(chunkRes, { userId: 12 }, { ownerUserId: 99 }),
    false,
  );
  assert.strictEqual(chunkRes.statusCode, 403);
  assert.strictEqual(
    denyUnlessChunkSessionOwner(mockRes(), { userId: 12 }, { ownerUserId: 12 }),
    true,
  );
})().then(() => {
  console.log('agentDataScope: ok');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

{
  const res = mockRes();
  const question = { db_file_path: '/a.db', vector_file_path: null };
  assert.strictEqual(
    assertAgentQuestionUpdateAllowed(res, true, question, { clearDbFile: 'true' }, {}),
    false
  );
  assert.strictEqual(res.statusCode, 403);
}
