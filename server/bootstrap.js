const express = require('express');
const http = require('http');
const { dbOperations } = require('../database');
const { createTelegramIntegration } = require('../telegram');
const { isLegacyMigratedApiBlocked } = require('../legacy-node-allowlist');
const {
  rootDir,
  PORT,
  HOST,
  SESSION_SECRET,
  logger,
  distPath
} = require('./config');
const { registerApiRateLimit, loginLimiter } = require('./middleware/rate-limit');
const { registerLaravelProxy } = require('./middleware/laravel-proxy');
const { registerLegacyBlockMiddleware } = require('./middleware/legacy-block');
const { applyCompression, applySessionBodyAndCsrf } = require('./middleware/session-csrf');
const {
  requireUser,
  requireAdmin,
  canAccessLegacyAdminApiAsync,
  tryPersistAdminSession,
} = require('./lib/auth');
const {
  resolveAdminRequestContext,
  toAdminSessionUser,
} = require('./lib/adminRequestContext');
const uploads = require('./lib/uploads');
const { attachWebSocket } = require('./ws');
const { registerStaticRoutes, registerSpaFallback, registerErrorHandler } = require('./routes/static');
const { registerLegacyMigratedRoutes } = require('./routes/legacy-migrated');
const { registerChatRoutes } = require('./routes/chat');
const { registerDeviceRoutes } = require('./routes/device');
const { registerInternalRoutes } = require('./routes/internal');
const { NODE_INTERNAL_SECRET } = require('./lib/bridge-token');

function createApp() {
  const app = express();

  if (process.env.TRUST_PROXY === 'false' || process.env.TRUST_PROXY === '0') {
    app.set('trust proxy', false);
  } else {
    const hops = parseInt(process.env.TRUST_PROXY || '1', 10);
    app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1);
  }

  applyCompression(app);
  registerApiRateLimit(app);
  const laravelProxy = registerLaravelProxy(app, { logger });
  registerLegacyBlockMiddleware(app);
  applySessionBodyAndCsrf(app);

  const adminTokens = new Set();
  const chatSessions = new Map();

  const deps = {
    logger,
    dbOperations,
    loginLimiter,
    rootDir,
    adminTokens,
    chatSessions,
    requireUser,
    requireAdmin,
    canAccessLegacyAdminApiAsync,
    tryPersistAdminSession,
    resolveAdminRequestContext,
    toAdminSessionUser,
    broadcastToChat: () => {},
    ...uploads
  };

  registerStaticRoutes(app, deps);
  registerLegacyMigratedRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerDeviceRoutes(app, deps);
  registerSpaFallback(app);
  registerErrorHandler(app);

  uploads.registerUploadCleanupIntervals();

  return { app, deps, laravelProxy };
}

function start() {
  const { app, deps, laravelProxy } = createApp();
  const server = http.createServer(app);

  attachWebSocket(server, deps);

  const telegram = createTelegramIntegration({ broadcastToChat: deps.broadcastToChat });
  deps.telegram = telegram;

  registerInternalRoutes(app, deps);

  server.listen(PORT, HOST, () => {
    logger.info('API server started', { port: PORT, host: HOST });
    logger.info(`Serving Vue frontend from: ${distPath}`);
    console.log(`API server running on http://${HOST}:${PORT}`);
    console.log(`WebSocket server running on ws://${HOST}:${PORT}/ws`);
    console.log(`Serving Vue frontend from: ${distPath}`);

    if (isLegacyMigratedApiBlocked()) {
      console.log('[Scope] Node 对外 API：上传 + Telegram 内部 + 在线客服/设备验签(过渡)；其余 /api/* 已停用，请走 /api/v2');
    } else {
      console.warn('[Security] BLOCK_LEGACY_MIGRATED_API is disabled — migrated legacy routes are exposed.');
    }
    if (!SESSION_SECRET || SESSION_SECRET === 'your-secret-key-here') {
      console.warn('[Security] SESSION_SECRET is default or empty — change it in production.');
    }
    if (!NODE_INTERNAL_SECRET) {
      console.warn('[Security] NODE_INTERNAL_SECRET is not set in root .env — legacy Node session bridge and Telegram internal API will fail.');
    }
    if (laravelProxy?.enabled) {
      console.log(`[Dev Proxy] /api/v2 + /sanctum -> ${laravelProxy.target}`);
    }

    telegram.setupMultiBotPolling({ broadcastToChat: deps.broadcastToChat });
  });

  return { app, server, deps };
}

module.exports = start;
module.exports.createApp = createApp;
module.exports.start = start;
