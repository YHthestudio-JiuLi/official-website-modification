const crypto = require('crypto');

const NODE_INTERNAL_SECRET = process.env.NODE_INTERNAL_SECRET || '';

/** 校验 Laravel 签发的 legacy Node bridge token */
function verifyLegacyNodeBridgeToken(token) {
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
    return data.uid;
  } catch {
    return null;
  }
}

function requireInternalSecret(req, res, next) {
  if (!NODE_INTERNAL_SECRET) {
    return res.status(503).json({ error: 'Internal API disabled' });
  }
  const provided = req.headers['x-internal-secret'] || req.body?.secret;
  if (provided !== NODE_INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = {
  NODE_INTERNAL_SECRET,
  verifyLegacyNodeBridgeToken,
  requireInternalSecret
};
