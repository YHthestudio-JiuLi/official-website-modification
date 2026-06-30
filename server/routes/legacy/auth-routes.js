const express = require('express');
const bcrypt = require('bcryptjs');
const { comparePassword } = require('../../lib/password');
const { saveSession } = require('../../lib/session');
const { verifyLegacyNodeBridgeToken } = require('../../lib/bridge-token');

function registerLegacyAuthRoutes(app, deps) {
  const {
    dbOperations,
    loginLimiter,
    canAccessLegacyAdminApiAsync,
    resolveLegacyAdminFromBridge,
    tryPersistAdminSession,
  } = deps;

  app.get('/api/auth/me', (req, res) => {
    if (req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ user: null });
    }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const user = await dbOperations.users.findByUsername(username);

    if (user && await comparePassword(password, user.password)) {
      req.session.user = { id: user.id, username: user.username, email: user.email };
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    const existingUser = await dbOperations.users.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmail = await dbOperations.users.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await dbOperations.users.create(username, email, hashedPassword, 0);

    req.session.user = { id: userId, username, email };
    res.json({ user: req.session.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.user = null;
    res.json({ message: 'Logged out' });
  });

  /** Laravel V2 已登录时，用短期 bridge token 建立 Node 前台用户会话（在线客服等） */
  app.post('/api/auth/establish', express.json(), async (req, res) => {
    const uid = verifyLegacyNodeBridgeToken(req.body?.token);
    if (!uid) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    try {
      const user = await dbOperations.users.findById(uid);
      if (!user) {
        return res.status(403).json({ error: 'User not found in legacy database' });
      }
      req.session.user = { id: user.id, username: user.username, email: user.email };
      await saveSession(req);
      return res.json({ user: req.session.user });
    } catch (error) {
      console.error('[auth/establish] 失败:', error.message);
      return res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.get('/api/admin/auth/me', async (req, res) => {
    try {
      if (!req.session.admin) {
        const bridged = await resolveLegacyAdminFromBridge(req);
        if (bridged) {
          await tryPersistAdminSession(req, bridged);
        }
      }
      if (req.session.admin) {
        return res.json({ admin: req.session.admin });
      }
      return res.status(401).json({ admin: null });
    } catch (error) {
      console.error('[admin/auth/me] 失败:', error.message);
      return res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.post('/api/admin/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = await dbOperations.users.findByUsername(username);

      if (user && await canAccessLegacyAdminApiAsync(user) && await comparePassword(password, user.password)) {
        req.session.admin = { id: user.id, username: user.username, email: user.email };
        await saveSession(req);
        res.json({ admin: req.session.admin });
      } else {
        res.status(401).json({ message: 'Invalid username or password' });
      }
    } catch (error) {
      console.error('[admin/auth/login] 失败:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  /** Laravel V2 已登录时，用短期 bridge token 建立 Node admin 会话（生产双栈 Cookie 同步） */
  app.post('/api/admin/auth/establish', express.json(), async (req, res) => {
    const uid = verifyLegacyNodeBridgeToken(req.body?.token);
    if (!uid) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    try {
      const user = await dbOperations.users.findById(uid);
      if (!user || !(await canAccessLegacyAdminApiAsync(user))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.session.admin = { id: user.id, username: user.username, email: user.email };
      await saveSession(req);
      return res.json({ admin: req.session.admin });
    } catch (error) {
      console.error('[admin/auth/establish] 失败:', error.message);
      return res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    req.session.admin = null;
    res.json({ message: 'Logged out' });
  });
}

module.exports = { registerLegacyAuthRoutes };
