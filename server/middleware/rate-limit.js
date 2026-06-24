const rateLimit = require('express-rate-limit');
const {
  isAdminApiRequest,
  isChatApiRequest,
  isDeviceApiRequest
} = require('./request-kinds');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many device API requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function registerApiRateLimit(app) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login' || req.path === '/admin/auth/login') {
      return next();
    }
    if (isAdminApiRequest(req)) {
      return next();
    }
    if (isDeviceApiRequest(req)) {
      return deviceLimiter(req, res, next);
    }
    if (isChatApiRequest(req)) {
      return next();
    }
    return limiter(req, res, next);
  });
}

module.exports = {
  limiter,
  loginLimiter,
  deviceLimiter,
  registerApiRateLimit
};
