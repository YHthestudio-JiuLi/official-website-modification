/**
 * Node 旧 API 白名单（与 src/utils/apiPath.js 保持一致）
 * 已迁入 Laravel /api/v2 的业务接口不在此列，应由 blockLegacyMigratedApi 中间件拒绝
 */

const LEGACY_NODE_EXACT = new Set([
  '/api/csrf-token',
  '/api/admin/auth/login',
  '/api/admin/auth/logout',
  '/api/admin/auth/me',
])

const LEGACY_NODE_PREFIXES = [
  '/api/internal/',
  '/api/chat/',
  '/api/device/',
  '/api/admin/questions',
  '/api/admin/chat',
  '/api/admin/device',
]

/** 迁移期只读：历史商品图仍由 Node 提供 */
const LEGACY_PRODUCT_IMAGE = /^\/api\/product-images\/\d+$/

/**
 * @param {string} path
 * @param {string} prefix
 */
function matchesLegacyPrefix(path, prefix) {
  if (prefix.endsWith('/')) {
    return path.startsWith(prefix)
  }
  return path === prefix || path.startsWith(prefix)
}

/**
 * @param {string} url 请求路径（可含 query）
 * @returns {boolean}
 */
function isLegacyNodeAllowedPath(url) {
  const path = String(url || '').split('?')[0]
  if (!path.startsWith('/api/')) {
    return false
  }
  if (LEGACY_NODE_EXACT.has(path)) {
    return true
  }
  if (LEGACY_PRODUCT_IMAGE.test(path)) {
    return true
  }
  return LEGACY_NODE_PREFIXES.some((prefix) => matchesLegacyPrefix(path, prefix))
}

function isLegacyMigratedApiBlocked() {
  const v = String(process.env.BLOCK_LEGACY_MIGRATED_API ?? 'true').trim().toLowerCase()
  return v !== 'false' && v !== '0'
}

module.exports = {
  isLegacyNodeAllowedPath,
  isLegacyMigratedApiBlocked,
}
