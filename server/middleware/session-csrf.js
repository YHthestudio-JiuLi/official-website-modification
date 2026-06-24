const bodyParser = require('body-parser');
const session = require('express-session');
const compression = require('compression');
const csrf = require('csurf');
const { SESSION_SECRET } = require('../config');
const {
  isAdminApiRequest,
  isChatApiRequest,
  isAuthApiRequest,
  isDeviceApiRequest
} = require('./request-kinds');

const csrfProtection = csrf({
  cookie: false,
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

function applyCompression(app) {
  app.use(compression());
}

function applySessionBodyAndCsrf(app) {
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    next();
  });

  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  app.use(bodyParser.json({ limit: '10mb' }));

  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.SESSION_COOKIE_SECURE === 'true'
        ? true
        : (process.env.SESSION_COOKIE_SECURE === 'false' ? false : 'auto'),
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    },
    name: 'yh.node.sid',
  }));

  app.use('/api', (req, res, next) => {
    if (isChatApiRequest(req) || isAdminApiRequest(req) || isAuthApiRequest(req) || isDeviceApiRequest(req) || req.path.startsWith('/internal/')) {
      return next();
    }
    csrfProtection(req, res, next);
  });
}

function applyCoreMiddleware(app) {
  applyCompression(app);
  applySessionBodyAndCsrf(app);
}

module.exports = {
  applyCompression,
  applySessionBodyAndCsrf,
  applyCoreMiddleware,
  csrfProtection
};
