const PY_DB_URL = process.env.PY_DB_URL || 'http://127.0.0.1:5100';

async function rpc(op, args = {}) {
  const res = await fetch(`${PY_DB_URL}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op, args })
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {
    // ignore
  }

  if (!res.ok) {
    const detail = payload && (payload.detail || payload.error || payload.message);
    throw new Error(detail || `Python DB backend error (${res.status})`);
  }

  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || 'Python DB backend returned invalid payload');
  }

  return payload.result;
}

const dbOperations = {
  users: {
    findAll: () => rpc('users.findAll'),
    findById: (id) => rpc('users.findById', { id }),
    findByUsername: (username) => rpc('users.findByUsername', { username }),
    findByEmail: (email) => rpc('users.findByEmail', { email }),
    create: (username, email, password, isAdmin = 0) =>
      rpc('users.create', { username, email, password, isAdmin }),
    update: (id, email, password, isAdmin) =>
      rpc('users.update', { id, email, password, isAdmin }),
    delete: (id) => rpc('users.delete', { id })
  },
  products: {
    findAll: () => rpc('products.findAll'),
    findById: (id) => rpc('products.findById', { id }),
    create: (name, description, image, date, price, priceUsdt) =>
      rpc('products.create', { name, description, image, date, price, priceUsdt }),
    update: (id, name, description, image, date, price, priceUsdt) =>
      rpc('products.update', { id, name, description, image, date, price, priceUsdt }),
    delete: (id) => rpc('products.delete', { id })
  },
  orders: {
    findAll: (statusFilter = '') => rpc('orders.findAll', { statusFilter }),
    findById: (id) => rpc('orders.findById', { id }),
    findByUserId: (userId) => rpc('orders.findByUserId', { userId }),
    create: (orderData) => rpc('orders.create', { orderData }),
    updateStatus: (id, status) => rpc('orders.updateStatus', { id, status }),
    updateTxHash: (id, txHash) => rpc('orders.updateTxHash', { id, txHash }),
    updateShippingAddress: (id, shippingAddress) => rpc('orders.updateShippingAddress', { id, shippingAddress }),
    getStats: () => rpc('orders.getStats'),
    delete: (id) => rpc('orders.delete', { id }),
    deleteExpiredPending: (minutes) => rpc('orders.deleteExpiredPending', { minutes })
  },
  forumPosts: {
    findAll: () => rpc('forumPosts.findAll'),
    findById: (id) => rpc('forumPosts.findById', { id }),
    create: (title, author, content, date, replies = 0) =>
      rpc('forumPosts.create', { title, author, content, date, replies }),
    update: (id, title, author, content, date, replies) =>
      rpc('forumPosts.update', { id, title, author, content, date, replies }),
    togglePin: (id) => rpc('forumPosts.togglePin', { id }),
    delete: (id) => rpc('forumPosts.delete', { id }),
    incrementReplies: (id) => rpc('forumPosts.incrementReplies', { id })
  },
  forumReplies: {
    findByPostId: (postId) => rpc('forumReplies.findByPostId', { postId }),
    findById: (id) => rpc('forumReplies.findById', { id }),
    create: (postId, author, content, parentReplyId = null) =>
      rpc('forumReplies.create', { postId, author, content, parentReplyId }),
    delete: (id) => rpc('forumReplies.delete', { id })
  },
  paymentSettings: {
    get: () => rpc('paymentSettings.get'),
    update: (walletAddress, network = 'TRC20', autoDeleteMinutes = 30) =>
      rpc('paymentSettings.update', { walletAddress, network, autoDeleteMinutes })
  }
};

module.exports = { db: null, dbOperations };
