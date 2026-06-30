const path = require('path');
const fs = require('fs');
const { translateProduct, translateProducts } = require('../../../translate');

function registerLegacyProductRoutes(app, deps) {
  const {
    dbOperations,
    requireAdmin,
    productImageUpload,
    productUploadsPath,
    normalizeProductRecord,
    serializeProductDetailJson,
    parseProductCategoryId,
    parseProductSubCategoryId,
    parseCategoryParentId,
  } = deps;

  app.get('/api/product-categories', async (req, res) => {
    try {
      const categories = await dbOperations.productCategories.findAll();
      res.json(categories);
    } catch (error) {
      console.error('[API Error] /api/product-categories:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const products = await dbOperations.products.findAll();
      const translatedProducts = translateProducts(products).map(normalizeProductRecord);
      res.json(translatedProducts);
    } catch (error) {
      console.error('[API Error] /api/products:', error.message);
      res.status(503).json({ error: 'Database service unavailable. Please start Python backend with: npm run py' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const product = await dbOperations.products.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const translatedProduct = normalizeProductRecord(translateProduct(product));
      res.json(translatedProduct);
    } catch (error) {
      console.error('[API Error] /api/products/:id:', error.message);
      res.status(503).json({ error: 'Database service unavailable' });
    }
  });

  app.get('/api/admin/products', requireAdmin, async (req, res) => {
    const products = await dbOperations.products.findAll();
    res.json(products.map(normalizeProductRecord));
  });

  app.get('/api/admin/products/:id', requireAdmin, async (req, res) => {
    const product = await dbOperations.products.findById(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(normalizeProductRecord(product));
  });

  app.post('/api/admin/upload/product-image', requireAdmin, (req, res) => {
    productImageUpload.single('image')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image is too large (max 5MB)' });
        }
        return res.status(400).json({ error: err.message || 'Image upload failed' });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No image uploaded' });
      }
      try {
        // 入库为 BLOB，返回可访问的图片 URL
        const dataBase64 = req.file.buffer.toString('base64');
        const mime = req.file.mimetype || 'application/octet-stream';
        const filename = req.file.originalname || null;
        const imageId = await dbOperations.images.create(dataBase64, mime, filename);
        return res.json({ ok: true, image: `/api/product-images/${imageId}` });
      } catch (e) {
        console.error('[API Error] upload product-image:', e.message);
        return res.status(503).json({ error: 'Failed to store image' });
      }
    });
  });

  // 从 MySQL 读取并输出图片二进制
  app.get('/api/product-images/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid image id' });
    }
    try {
      const img = await dbOperations.images.get(id);
      if (!img) {
        return res.status(404).json({ error: 'Image not found' });
      }
      const buffer = Buffer.from(img.dataBase64 || '', 'base64');
      res.setHeader('Content-Type', img.mime || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.end(buffer);
    } catch (e) {
      console.error('[API Error] get product-image:', e.message);
      return res.status(503).json({ error: 'Failed to load image' });
    }
  });

  app.delete('/api/admin/upload/product-image', requireAdmin, async (req, res) => {
    const imagePath = req.body?.image || '';
    // 新格式：/api/product-images/<id> → 删除 MySQL BLOB
    const apiMatch = typeof imagePath === 'string' && imagePath.match(/^\/api\/product-images\/(\d+)$/);
    if (apiMatch) {
      try {
        await dbOperations.images.delete(parseInt(apiMatch[1], 10));
      } catch (e) {
        console.error('[API Error] delete product-image:', e.message);
      }
      return res.json({ ok: true });
    }
    // 兼容旧的磁盘图片路径
    if (typeof imagePath !== 'string' || !imagePath.startsWith('/uploads/products/')) {
      return res.status(400).json({ error: 'Invalid image path' });
    }
    const filename = path.basename(imagePath);
    const target = path.join(productUploadsPath, filename);
    if (!target.startsWith(productUploadsPath)) {
      return res.status(400).json({ error: 'Invalid image path' });
    }
    if (!fs.existsSync(target)) {
      return res.json({ ok: true });
    }
    fs.unlink(target, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete image' });
      }
      return res.json({ ok: true });
    });
  });

  app.post('/api/admin/products', requireAdmin, async (req, res) => {
    const { name, description, image, date, priceUsdt } = req.body;
    const price = parseFloat(priceUsdt) || 0;
    const productDate = date || new Date().toISOString().split('T')[0];
    const { featuresJson, specsJson, usageNoticeJson } = serializeProductDetailJson(req.body);
    const categoryId = parseProductCategoryId(req.body);
    const subCategoryId = parseProductSubCategoryId(req.body);
    await dbOperations.products.create(
      name, description, image, productDate, price, price,
      featuresJson, specsJson, usageNoticeJson, categoryId, subCategoryId
    );
    res.json({ success: true });
  });

  app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
    const { name, description, image, date, priceUsdt } = req.body;
    const price = parseFloat(priceUsdt) || 0;
    const productDate = date || new Date().toISOString().split('T')[0];
    const { featuresJson, specsJson, usageNoticeJson } = serializeProductDetailJson(req.body);
    const categoryId = parseProductCategoryId(req.body);
    const subCategoryId = parseProductSubCategoryId(req.body);
    await dbOperations.products.update(
      parseInt(req.params.id, 10), name, description, image, productDate, price, price,
      featuresJson, specsJson, usageNoticeJson, categoryId, subCategoryId
    );
    res.json({ success: true });
  });

  app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
    await dbOperations.products.delete(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  app.get('/api/admin/product-categories', requireAdmin, async (req, res) => {
    const categories = await dbOperations.productCategories.findAll();
    res.json(categories);
  });

  app.post('/api/admin/product-categories', requireAdmin, async (req, res) => {
    const { name, nameEn, slug, sortOrder } = req.body || {};
    const parentId = parseCategoryParentId(req.body);
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    try {
      const id = await dbOperations.productCategories.create(
        String(name).trim(),
        nameEn ? String(nameEn).trim() : null,
        slug ? String(slug).trim() : null,
        parseInt(sortOrder, 10) || 0,
        parentId
      );
      res.json({ success: true, id });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to create category' });
    }
  });

  app.put('/api/admin/product-categories/:id', requireAdmin, async (req, res) => {
    const { name, nameEn, slug, sortOrder } = req.body || {};
    const parentId = parseCategoryParentId(req.body);
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    try {
      await dbOperations.productCategories.update(
        parseInt(req.params.id, 10),
        String(name).trim(),
        nameEn ? String(nameEn).trim() : null,
        slug ? String(slug).trim() : null,
        parseInt(sortOrder, 10) || 0,
        parentId
      );
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to update category' });
    }
  });

  app.delete('/api/admin/product-categories/:id', requireAdmin, async (req, res) => {
    try {
      await dbOperations.productCategories.delete(parseInt(req.params.id, 10));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to delete category' });
    }
  });
}

module.exports = { registerLegacyProductRoutes };
