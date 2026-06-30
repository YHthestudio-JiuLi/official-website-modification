function registerLegacyPopupNoticeRoutes(app, deps) {
  const { dbOperations, requireAdmin } = deps;

  app.get('/api/popup-notice', async (req, res) => {
    try {
      const scope = String(req.query.scope || 'popup').toLowerCase();
      const notice = scope === 'display'
        ? await dbOperations.popupNotices.findActiveDisplay()
        : await dbOperations.popupNotices.findActive();
      res.json({ notice });
    } catch (error) {
      console.error('[API Error] /api/popup-notice:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.get('/api/admin/popup-notices', requireAdmin, async (req, res) => {
    try {
      const notices = await dbOperations.popupNotices.findAll();
      res.json({ notices });
    } catch (error) {
      console.error('[API Error] /api/admin/popup-notices:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.post('/api/admin/popup-notices', requireAdmin, async (req, res) => {
    const { title, content, enabled, popup_enabled, display_enabled } = req.body || {};
    try {
      const hasScope = popup_enabled !== undefined || display_enabled !== undefined;
      const popup = hasScope ? popup_enabled !== false : enabled !== false;
      const display = hasScope ? display_enabled !== false : enabled !== false;
      const notice = await dbOperations.popupNotices.create(title, content, popup, display);
      if (!notice) return res.status(400).json({ error: 'Invalid input' });
      res.json({ notice });
    } catch (error) {
      console.error('[API Error] POST /api/admin/popup-notices:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.put('/api/admin/popup-notices/:id', requireAdmin, async (req, res) => {
    const { title, content, enabled, popup_enabled, display_enabled } = req.body || {};
    try {
      const existing = await dbOperations.popupNotices.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const hasScope = popup_enabled !== undefined || display_enabled !== undefined;
      const popup = hasScope
        ? popup_enabled !== false
        : (enabled !== undefined ? enabled !== false : !!existing.popup_enabled);
      const display = hasScope
        ? display_enabled !== false
        : (enabled !== undefined ? enabled !== false : !!existing.display_enabled);
      const notice = await dbOperations.popupNotices.update(
        req.params.id,
        title ?? existing.title,
        content ?? existing.content,
        popup,
        display
      );
      if (!notice) return res.status(404).json({ error: 'Not found or invalid input' });
      res.json({ notice });
    } catch (error) {
      console.error('[API Error] PUT /api/admin/popup-notices/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.delete('/api/admin/popup-notices/:id', requireAdmin, async (req, res) => {
    try {
      await dbOperations.popupNotices.delete(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error('[API Error] DELETE /api/admin/popup-notices/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });
}

module.exports = { registerLegacyPopupNoticeRoutes };
