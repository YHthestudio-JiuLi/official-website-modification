const bcrypt = require('bcryptjs');

function parseAdminFlag(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

function registerLegacyAdminUserRoutes(app, deps) {
  const { dbOperations, requireAdmin } = deps;

  app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    const users = await dbOperations.users.findAll();
    const products = await dbOperations.products.findAll();
    const posts = await dbOperations.forumPosts.findAll();
    const orderStats = await dbOperations.orders.getStats();

    res.json({
      totalUsers: users.length,
      totalProducts: products.length,
      totalPosts: posts.length,
      totalOrders: orderStats.total,
      pendingOrders: orderStats.pending,
      totalRevenue: orderStats.revenue,
    });
  });

  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await dbOperations.users.findAll();
    res.json(users);
  });

  app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const user = await dbOperations.users.findById(parseInt(req.params.id, 10));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { username, email, password, isAdmin } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const existingUsername = await dbOperations.users.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmail = await dbOperations.users.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await dbOperations.users.create(username, email, hashedPassword, parseAdminFlag(isAdmin));
    res.json({ success: true });
  });

  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const { email, password, isAdmin } = req.body;
    const userId = parseInt(req.params.id, 10);

    const user = await dbOperations.users.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingUser = await dbOperations.users.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const nextIsAdmin = parseAdminFlag(isAdmin);

    // 防止管理员修改资料/密码时误把自己降级，导致立刻无法登录后台
    if (req.session?.admin?.id === userId && nextIsAdmin !== 1) {
      return res.status(400).json({ message: 'Cannot remove your own admin role' });
    }

    let hashedPassword = null;
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    await dbOperations.users.update(userId, email, hashedPassword, nextIsAdmin);
    res.json({ success: true });
  });

  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    await dbOperations.users.delete(parseInt(req.params.id, 10));
    res.json({ success: true });
  });
}

module.exports = { registerLegacyAdminUserRoutes };
