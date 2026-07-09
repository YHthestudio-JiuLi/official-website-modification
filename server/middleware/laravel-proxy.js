const http = require('http');
const https = require('https');

const DEFAULT_LARAVEL_BASE_URL = 'http://127.0.0.1:8000';

function shouldEnableLaravelProxy() {
  const raw = String(process.env.ENABLE_LARAVEL_PROXY || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  // 默认仅在非生产环境启用，避免影响线上 Nginx 反代边界
  return process.env.NODE_ENV !== 'production';
}

function buildTarget(pathWithQuery) {
  const base = String(process.env.LARAVEL_PUBLIC_URL || DEFAULT_LARAVEL_BASE_URL).trim();
  return new URL(pathWithQuery, base);
}

function filterProxyRequestHeaders(headers) {
  const out = { ...headers };
  delete out.connection;
  delete out['content-length'];
  return out;
}

function copyProxyResponseHeaders(sourceHeaders, res) {
  for (const [name, value] of Object.entries(sourceHeaders || {})) {
    if (typeof value === 'undefined') continue;
    if (name.toLowerCase() === 'transfer-encoding') continue;
    res.setHeader(name, value);
  }
}

function proxyToLaravel(req, res, logger) {
  const target = buildTarget(req.originalUrl || req.url || '/');
  const transport = target.protocol === 'https:' ? https : http;

  const upstreamReq = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers: filterProxyRequestHeaders(req.headers),
    },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode || 502);
      copyProxyResponseHeaders(upstreamRes.headers, res);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.setTimeout(30000, () => {
    upstreamReq.destroy(new Error('laravel upstream timeout'));
  });

  upstreamReq.on('error', (error) => {
    logger.warn('laravel_public_proxy_failed', {
      url: req.originalUrl,
      method: req.method,
      target: `${target.origin}${target.pathname}`,
      error: error.message,
    });
    if (res.headersSent) return;
    res.status(502).json({
      error: 'laravel_upstream_unreachable',
      message: 'Laravel upstream is unreachable',
      message_zh: 'Laravel 服务不可用，请先启动 npm run laravel',
    });
  });

  req.pipe(upstreamReq);
}

function registerLaravelProxy(app, deps = {}) {
  const { logger = console } = deps;
  const enabled = shouldEnableLaravelProxy();
  if (!enabled) {
    return { enabled: false };
  }

  app.use((req, res, next) => {
    const requestPath = String(req.path || '');
    if (
      requestPath === '/api/v2'
      || requestPath.startsWith('/api/v2/')
      || requestPath === '/sanctum'
      || requestPath.startsWith('/sanctum/')
    ) {
      return proxyToLaravel(req, res, logger);
    }
    return next();
  });

  return {
    enabled: true,
    target: String(process.env.LARAVEL_PUBLIC_URL || DEFAULT_LARAVEL_BASE_URL).trim(),
  };
}

module.exports = {
  registerLaravelProxy,
  shouldEnableLaravelProxy,
};
