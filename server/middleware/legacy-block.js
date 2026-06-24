const { isLegacyNodeAllowedPath, isLegacyMigratedApiBlocked } = require('../../legacy-node-allowlist');
const { _apiPathNoQuery } = require('./request-kinds');

function registerLegacyBlockMiddleware(app) {
  app.use('/api', (req, res, next) => {
    const fullPath = _apiPathNoQuery(req);
    // /api/v2 应由 Nginx 反代到 Laravel；若误打到 Node，返回明确 JSON 而非 SPA HTML
    if (fullPath.startsWith('/api/v2/') || fullPath === '/api/v2') {
      return res.status(503).json({
        error: 'v2_api_misrouted',
        message: 'Configure nginx to proxy /api/v2 and /sanctum to Laravel :8000',
        message_zh: '请配置 Nginx 将 /api/v2、/sanctum 反代到 Laravel :8000',
      });
    }
    if (!isLegacyMigratedApiBlocked()) {
      return next();
    }
    if (isLegacyNodeAllowedPath(fullPath, req.method)) {
      return next();
    }
    return res.status(410).json({
      success: false,
      error: 'legacy_api_retired',
      message: 'This API endpoint has been retired. Please use /api/v2 instead.',
      message_zh: '该接口已停用，请使用 /api/v2 访问。',
      v2_path: fullPath.replace(/^\/api\//, '/api/v2/'),
    });
  });
}

module.exports = { registerLegacyBlockMiddleware };
