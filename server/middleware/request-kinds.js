// 挂载在 /api 下时，不同 Express 版本 req.path 可能是 /admin/... 或 /api/admin/...，用 originalUrl 兜底
function _apiPathNoQuery(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function isAdminApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/admin')) return true;
  const p = String(req.path || '');
  return p.startsWith('/admin/') || p.startsWith('/api/admin/');
}

function isChatApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/chat')) return true;
  return String(req.path || '').startsWith('/chat/');
}

function isAuthApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/auth')) return true;
  return String(req.path || '').startsWith('/auth/');
}

function isDeviceApiRequest(req) {
  const full = _apiPathNoQuery(req);
  if (full.startsWith('/api/device')) return true;
  return String(req.path || '').startsWith('/device/');
}

module.exports = {
  _apiPathNoQuery,
  isAdminApiRequest,
  isChatApiRequest,
  isAuthApiRequest,
  isDeviceApiRequest
};
