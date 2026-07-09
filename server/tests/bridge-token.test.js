const assert = require('assert');
const crypto = require('crypto');
const {
  parseBridgeToken,
  verifyLegacyNodeBridgeToken,
  BRIDGE_AUD_ADMIN,
  BRIDGE_AUD_USER,
} = require('../lib/bridge-token');

function mintTestToken(uid, aud, secret = 'test-bridge-secret', expOffsetSec = 3600) {
  const payloadB64 = Buffer.from(JSON.stringify({
    uid,
    aud,
    exp: Math.floor(Date.now() / 1000) + expOffsetSec,
  })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

process.env.NODE_INTERNAL_SECRET = 'test-bridge-secret';

const adminToken = mintTestToken(12, BRIDGE_AUD_ADMIN);
const userToken = mintTestToken(12, BRIDGE_AUD_USER);
const legacyTokenNoAud = (() => {
  const payloadB64 = Buffer.from(JSON.stringify({
    uid: 12,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', 'test-bridge-secret').update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
})();

assert.strictEqual(parseBridgeToken(adminToken)?.aud, BRIDGE_AUD_ADMIN);
assert.strictEqual(parseBridgeToken(userToken)?.aud, BRIDGE_AUD_USER);
assert.strictEqual(parseBridgeToken(legacyTokenNoAud), null);
assert.strictEqual(verifyLegacyNodeBridgeToken(adminToken, BRIDGE_AUD_ADMIN), 12);
assert.strictEqual(verifyLegacyNodeBridgeToken(userToken, BRIDGE_AUD_ADMIN), null);
assert.strictEqual(verifyLegacyNodeBridgeToken(userToken, BRIDGE_AUD_USER), 12);

console.log('bridge-token: ok');
