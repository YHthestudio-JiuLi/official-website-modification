const express = require('express');
const {
  notifyForumNewPost,
  notifyForumNewReply,
  notifyOrderPaid
} = require('../../telegram');
const { requireInternalSecret } = require('../lib/bridge-token');

function registerInternalRoutes(app, deps) {
  const { telegram } = deps;
  const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

  app.post('/api/internal/telegram/forum-post', express.json(), requireInternalSecret, (req, res) => {
    res.json({ ok: true });
    notifyForumNewPost(req.body || {}).catch((err) => {
      console.error('[Forum Telegram] internal notify error:', err.message || err);
    });
  });

  app.post('/api/internal/telegram/forum-reply', express.json(), requireInternalSecret, (req, res) => {
    res.json({ ok: true });
    const { reply, post, parentReply } = req.body || {};
    if (reply && post) {
      notifyForumNewReply(reply, post, parentReply || null).catch((err) => {
        console.error('[Forum Telegram] internal reply notify error:', err.message || err);
      });
    }
  });

  app.post('/api/internal/telegram/order-paid', express.json(), requireInternalSecret, (req, res) => {
    res.json({ ok: true });
    notifyOrderPaid(req.body || {}).catch((err) => {
      console.error('[Order Telegram] internal notify error:', err.message || err);
    });
  });

  app.post('/api/internal/telegram/restart-bots', express.json(), requireInternalSecret, (req, res) => {
    res.json({ ok: true });
    telegram.restartMultiBotPolling?.().catch((err) => {
      console.error('[Telegram] internal restart-bots error:', err.message || err);
    });
  });

  app.post('/telegram/webhook', express.json(), (req, res) => {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const q = req.query && req.query.secret;
      if (q !== TELEGRAM_WEBHOOK_SECRET) {
        return res.status(403).send('forbidden');
      }
    }
    res.status(200).send('ok');
    telegram.handleUpdate(req.body).catch((err) => {
      console.error('[Telegram] webhook:', err.message || err);
    });
  });
}

module.exports = { registerInternalRoutes };
