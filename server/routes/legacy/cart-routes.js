function registerLegacyCartRoutes(app, deps) {
  const { dbOperations, requireUser, normalizeProductRecord } = deps;

  app.get('/api/cart', requireUser, async (req, res) => {
    try {
      const cart = await dbOperations.cart.get(req.session.user.id);
      res.json((cart || []).map(normalizeProductRecord));
    } catch (error) {
      console.error('[API Error] /api/cart:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.post('/api/cart/items', requireUser, async (req, res) => {
    const { productId, quantity = 1 } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }
    try {
      await dbOperations.cart.addItem(req.session.user.id, parseInt(productId, 10), parseInt(quantity, 10));
      res.json({ success: true });
    } catch (error) {
      console.error('[API Error] POST /api/cart/items:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.put('/api/cart/items/:productId', requireUser, async (req, res) => {
    const { quantity } = req.body;
    try {
      await dbOperations.cart.updateQuantity(req.session.user.id, parseInt(req.params.productId, 10), parseInt(quantity, 10));
      res.json({ success: true });
    } catch (error) {
      console.error('[API Error] PUT /api/cart/items/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.delete('/api/cart/items/:productId', requireUser, async (req, res) => {
    try {
      await dbOperations.cart.removeItem(req.session.user.id, parseInt(req.params.productId, 10));
      res.json({ success: true });
    } catch (error) {
      console.error('[API Error] DELETE /api/cart/items/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.delete('/api/cart', requireUser, async (req, res) => {
    try {
      await dbOperations.cart.clear(req.session.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error('[API Error] DELETE /api/cart:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });
}

module.exports = { registerLegacyCartRoutes };
