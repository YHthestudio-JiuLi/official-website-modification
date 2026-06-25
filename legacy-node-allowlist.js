/**
 * Node 职责白名单（与 src/utils/apiPath.js 保持一致）
 *
 * Node 仅负责：
 * 1. 大文件分片上传（Laravel 服务端代发，浏览器不直连 Node 会话）
 * 2. Telegram Bot / 内部通知
 *
 * 过渡期仍保留（后续可迁入 Laravel）：
 * - /api/chat/*、/ws 在线客服
 * - /api/device/* 设备公开验签
 *
 * 已迁入 Laravel /api/v2 的接口不在此列，由 blockLegacyMigratedApi 中间件返回 410
 */

const LEGACY_NODE_EXACT = new Set([
  '/api/csrf-token',
  '/api/admin/auth/me',
])

/** 仅允许 POST 的路径（题库/固件带文件写入仍经 Node 处理） */
const LEGACY_NODE_POST_ONLY = new Set([
  '/api/admin/questions',
  '/api/admin/auth/establish',
])

const LEGACY_NODE_PREFIXES = [
  '/api/internal/',
  '/api/chat/',
  '/api/device/',
  '/api/admin/questions/upload',
  '/api/admin/device-firmwares',
  '/api/admin/device-firmwares/upload',
]

/** 迁移期只读：历史商品图仍由 Node 提供 */
const LEGACY_PRODUCT_IMAGE = /^\/api\/product-images\/\d+$/

/** PUT 允许：题库带文件更新 */
const LEGACY_NODE_PUT_QUESTION = /^\/api\/admin\/questions\/\d+$/

/** DELETE 允许：题库删除（含 uploads 清理） */
const LEGACY_NODE_DELETE_QUESTION = /^\/api\/admin\/questions\/\d+$/

/** DELETE 允许：固件删除（含 uploads 清理） */
const LEGACY_NODE_DELETE_FIRMWARE = /^\/api\/admin\/device-firmwares\/\d+$/

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
 * @param {string} [method='GET']
 * @returns {boolean}
 */
function isLegacyNodeAllowedPath(url, method = 'GET') {
  const path = String(url || '').split('?')[0]
  const m = String(method || 'GET').toUpperCase()

  if (!path.startsWith('/api/')) {
    return false
  }
  if (LEGACY_NODE_EXACT.has(path)) {
    return true
  }
  if (LEGACY_PRODUCT_IMAGE.test(path)) {
    return true
  }
  if (LEGACY_NODE_POST_ONLY.has(path) && m === 'POST') {
    return true
  }
  if (LEGACY_NODE_PUT_QUESTION.test(path) && m === 'PUT') {
    return true
  }
  if (LEGACY_NODE_DELETE_QUESTION.test(path) && m === 'DELETE') {
    return true
  }
  if (LEGACY_NODE_DELETE_FIRMWARE.test(path) && m === 'DELETE') {
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
