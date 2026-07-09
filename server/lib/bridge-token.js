const crypto = require('crypto');

/** bridge token 受众：与 Laravel LegacyNodeBridgeTokenService 一致 */
const BRIDGE_AUD_USER = 'user';
const BRIDGE_AUD_ADMIN = 'admin';

/** 运行时读取，避免 telegram 在 dotenv 之前加载本模块时密钥被固化为空 */
function getNodeInternalSecret() {
  return process.env.NODE_INTERNAL_SECRET || '';
}

/** 解析并校验 Laravel 签发的 legacy Node bridge token */
function parseBridgeToken(token, requiredAud = null) {
  const NODE_INTERNAL_SECRET = getNodeInternalSecret();
  if (!NODE_INTERNAL_SECRET || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', NODE_INTERNAL_SECRET).update(payloadB64).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const data = JSON.parse(json);
    if (!data.uid || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (!data.aud) return null;
    if (requiredAud && data.aud !== requiredAud) return null;
    return {
      uid: Number(data.uid),
      aud: String(data.aud),
      exp: Number(data.exp),
    };
  } catch {
    return null;
  }
}

/** 校验 bridge token 并返回 uid（可选 aud 约束） */
function verifyLegacyNodeBridgeToken(token, requiredAud = null) {
  const parsed = parseBridgeToken(token, requiredAud);
  return parsed?.uid ?? null;
}

function requireInternalSecret(req, res, next) {
  const secret = getNodeInternalSecret();
  if (!secret) {
    return res.status(503).json({ error: 'Internal API disabled' });
  }
  const provided = req.headers['x-internal-secret'] || req.body?.secret;
  if (provided !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = {
  BRIDGE_AUD_USER,
  BRIDGE_AUD_ADMIN,
  get NODE_INTERNAL_SECRET() {
    return getNodeInternalSecret();
  },
  getNodeInternalSecret,
  parseBridgeToken,
  verifyLegacyNodeBridgeToken,
  requireInternalSecret,
};
