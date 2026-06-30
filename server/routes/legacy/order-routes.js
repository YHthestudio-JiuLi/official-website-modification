function registerLegacyOrderRoutes(app, deps) {
  const {
    dbOperations,
    requireUser,
    requireAdmin,
    getPaymentSettings,
    clearPaymentSettingsCache,
    getUsdtWalletAddress,
    verifyOrderPaymentTx,
    messageForVerifyFailure,
    notifyOrderPaid,
    translateProduct,
    resolveCheckoutConfig,
  } = deps;

  app.get('/api/payment-settings', async (req, res) => {
    const settings = await getPaymentSettings();
    res.json(settings || { network: 'TRC20' });
  });

  app.post('/api/orders', requireUser, async (req, res) => {
    const { productId, quantity = 1, shippingAddress, configId } = req.body;
    const product = await dbOperations.products.findById(parseInt(productId, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const checkout = resolveCheckoutConfig(product, configId);
    if (checkout.error) {
      return res.status(400).json({ error: checkout.error });
    }

    const price = checkout.price;
    const resolvedConfigId = checkout.configId;
    const resolvedConfigName = checkout.configName;

    const walletAddress = await getUsdtWalletAddress();
    const paymentSettings = await getPaymentSettings();
    const network = paymentSettings ? paymentSettings.network : 'TRC20';

    const translatedProduct = translateProduct(product);
    let productName = translatedProduct.name;
    if (resolvedConfigName) {
      productName = `${productName} - ${resolvedConfigName}`;
    }
    const orderData = {
      userId: req.session.user.id,
      username: req.session.user.username,
      productId: product.id,
      productName,
      quantity: parseInt(quantity, 10),
      price,
      totalAmount: price * parseInt(quantity, 10),
      status: 'pending',
      paymentMethod: 'USDT',
      usdtWallet: walletAddress,
      network: network,
      shippingAddress: shippingAddress,
      configId: resolvedConfigId,
      configName: resolvedConfigName,
    };

    const orderId = await dbOperations.orders.create(orderData);
    res.json({ orderId });
  });

  app.get('/api/orders', requireUser, async (req, res) => {
    const orders = await dbOperations.orders.findByUserId(req.session.user.id);
    res.json(orders);
  });

  app.get('/api/orders/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const order = await dbOperations.orders.findById(id);
    if (!order || order.userId !== req.session.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!order.network) {
      const paymentSettings = await getPaymentSettings();
      order.network = paymentSettings ? paymentSettings.network : 'TRC20';
    }
    res.json(order);
  });

  app.post('/api/orders/:id/confirm', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const order = await dbOperations.orders.findById(id);
    if (!order || order.userId !== req.session.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Order is already confirmed or not payable' });
    }

    const { txHash, shippingAddress } = req.body;
    if (!shippingAddress || !shippingAddress.trim()) {
      return res.status(400).json({ error: 'Shipping address required' });
    }

    if (txHash && txHash.trim()) {
      const trimmedHash = txHash.trim();
      const settings = await getPaymentSettings();
      const verification = await verifyOrderPaymentTx({
        network: order.network || 'TRC20',
        txHash: trimmedHash,
        expectedAmountUsdt: Number(order.totalAmount),
        expectedWalletAddress: settings?.wallet_address || order.usdtWallet || '',
        maxUnderpayUsdt: settings?.txVerifyMaxUnderpayUsdt != null
          ? Number(settings.txVerifyMaxUnderpayUsdt)
          : 5,
        maxAgeHours: settings?.txVerifyMaxAgeHours != null
          ? Number(settings.txVerifyMaxAgeHours)
          : 2,
      });

      if (!verification.valid) {
        if (verification.deleteOrder) {
          await dbOperations.orders.delete(id);
          const locale = String(req.headers['accept-language'] || 'zh');
          const msg = messageForVerifyFailure(verification.reason, {
            locale,
            expectedAmountUsdt: Number(order.totalAmount),
            paidAmount: verification.paidAmount,
            maxUnderpayUsdt: settings?.txVerifyMaxUnderpayUsdt != null
              ? Number(settings.txVerifyMaxUnderpayUsdt)
              : 5,
            maxAgeHours: settings?.txVerifyMaxAgeHours != null
              ? Number(settings.txVerifyMaxAgeHours)
              : 2,
          });
          return res.status(422).json({ success: false, deleted: true, reason: verification.reason, message: msg });
        }
        const locale = String(req.headers['accept-language'] || 'zh');
        const msg = verification.reason === 'tx_not_found'
          ? messageForVerifyFailure('tx_not_found', { locale })
          : messageForVerifyFailure(verification.reason, { locale });
        return res.status(422).json({ success: false, deleted: false, reason: verification.reason, message: msg });
      }

      await dbOperations.orders.updateShippingAddress(id, shippingAddress.trim());
      await dbOperations.orders.updateTxHash(id, trimmedHash);
      await dbOperations.orders.updateStatus(id, 'paid');
      try {
        const updatedOrder = await dbOperations.orders.findById(id);
        if (updatedOrder) {
          const underpay = settings?.txVerifyMaxUnderpayUsdt != null
            ? Number(settings.txVerifyMaxUnderpayUsdt)
            : 5;
          const maxAge = settings?.txVerifyMaxAgeHours != null
            ? Number(settings.txVerifyMaxAgeHours)
            : 2;
          const notifyPayload = {
            ...updatedOrder,
            txVerifyDisabled: underpay <= 0 && maxAge <= 0,
          };
          notifyOrderPaid(notifyPayload).catch((err) => {
            console.error('[Order Telegram] notify error:', err.message || err);
          });
        }
      } catch (err) {
        console.error('[Order Telegram] fetch order error:', err.message || err);
      }
      res.json({ success: true, message: 'Payment successful!' });
    } else {
      res.status(400).json({ error: 'Transaction hash required' });
    }
  });

  // 用户取消订单接口已移除（无取消订单功能）

  app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    const statusFilter = req.query.status || '';
    const orders = await dbOperations.orders.findAll(statusFilter);
    res.json(orders);
  });

  app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body;
    if (['pending', 'paid', 'shipped', 'delivered'].includes(status)) {
      await dbOperations.orders.updateStatus(parseInt(req.params.id, 10), status);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid status' });
    }
  });

  app.put('/api/admin/orders/:id/tracking', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { trackingNumber } = req.body || {};
    await dbOperations.orders.updateTrackingNumber(id, trackingNumber ?? '');
    const order = await dbOperations.orders.findById(id);
    res.json({ success: true, order });
  });

  app.get('/api/orders/:id/tracking', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const order = await dbOperations.orders.findById(id);
    if (!order || order.userId !== req.session.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const trackingNumber = (order.trackingNumber || '').trim();
    if (!trackingNumber) {
      return res.json({
        trackingNumber: null,
        carrier: 'SF',
        routes: [],
        source: 'none',
        externalUrl: null,
        apiEnabled: false,
      });
    }
    res.json({
      trackingNumber,
      carrier: 'SF',
      routes: [],
      source: 'external',
      externalUrl: 'https://www.sf-express.com/chn/sc/waybill',
      apiEnabled: false,
      message: 'Configure SF API in Laravel for live routes',
    });
  });

  app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    await dbOperations.orders.delete(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  app.get('/api/admin/payment-settings', requireAdmin, async (req, res) => {
    const settings = await getPaymentSettings();
    res.json(settings || {
      network: 'TRC20',
      autoDeleteMinutes: 30,
      txVerifyMaxUnderpayUsdt: 5,
      txVerifyMaxAgeHours: 2,
    });
  });

  app.put('/api/admin/payment-settings', requireAdmin, async (req, res) => {
    const {
      wallet_address,
      network,
      autoDeleteMinutes,
      txVerifyMaxUnderpayUsdt,
      txVerifyMaxAgeHours,
    } = req.body;
    if (!wallet_address || wallet_address.trim() === '') {
      return res.status(400).json({ message: 'Wallet address required' });
    }
    const deleteMinutes = parseInt(autoDeleteMinutes, 10) || 30;
    if (deleteMinutes < 1) {
      return res.status(400).json({ message: 'Auto delete time must be at least 1 minute' });
    }
    const underpay = Math.max(0, parseFloat(txVerifyMaxUnderpayUsdt) || 0);
    const maxAge = Math.max(0, parseInt(txVerifyMaxAgeHours, 10) || 0);
    await dbOperations.paymentSettings.update(
      wallet_address.trim(),
      network || 'TRC20',
      deleteMinutes,
      underpay,
      maxAge
    );
    clearPaymentSettingsCache();
    res.json({ success: true });
  });
}

module.exports = { registerLegacyOrderRoutes };
