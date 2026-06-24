const express = require('express');
const path = require('path');
const { distPath, uploadsPath, logger } = require('../config');

function registerStaticRoutes(app, deps) {
  const {
    requireAdmin,
    questionUploadsPath,
    nanoFirmwareUploadsPath
  } = deps;

  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  app.use('/assets', express.static(distPath + '/assets', {
    maxAge: '1y',
    etag: true,
    lastModified: true
  }));

  app.use(express.static(distPath, {
    index: false,
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (path.extname(filePath).toLowerCase() === '.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  app.use(
    '/uploads/questions',
    requireAdmin,
    express.static(questionUploadsPath, {
      maxAge: '30d',
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        const ext = path.extname(filePath).toLowerCase();
        if (['.db', '.sqlite', '.sqlite3', '.index', '.gz', '.zip', '.tar', '.tgz', '.7z', '.rar'].includes(ext)) {
          res.setHeader('Content-Disposition', 'attachment');
        }
      }
    })
  );

  app.use(
    '/uploads/nano-firmwares',
    requireAdmin,
    express.static(nanoFirmwareUploadsPath, {
      maxAge: '30d',
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        res.setHeader('Content-Disposition', 'attachment');
      }
    })
  );

  app.use(
    '/uploads',
    (req, res, next) => {
      const p = String(req.path || '');
      if (p.startsWith('/questions') || p.startsWith('/nano-firmwares')) {
        return res.status(404).send('Not found');
      }
      return next();
    },
    express.static(uploadsPath, {
      maxAge: '30d',
      etag: true,
      lastModified: true
    })
  );
}

function registerSpaFallback(app) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/sanctum/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.path.startsWith('/assets/') || req.path.startsWith('/dist/assets/')) {
      return res.status(404).send('File not found');
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

function registerErrorHandler(app) {
  app.use((err, req, res, next) => {
    if (err && err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        code: 'FILE_TOO_LARGE',
        error: '上传文件过大，题库文件最大支持 200MB'
      });
    }
    if (err && err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({
        code: 'INVALID_CSRF_TOKEN',
        error: 'Invalid CSRF token'
      });
    }
    logger.error('Unhandled error:', { error: err.message, stack: err.stack, url: req.url });
    res.status(500).json({ error: 'Internal server error' });
  });
}

module.exports = {
  registerStaticRoutes,
  registerSpaFallback,
  registerErrorHandler
};
