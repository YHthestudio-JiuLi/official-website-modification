/**
 * 将旧 /api/* 路径映射到 Laravel /api/v2/*（迁移期）
 * 聊天、设备验签、题库等仍走旧 Node，保持 /api/* 不变
 * 白名单逻辑与根目录 legacy-node-allowlist.js 保持一致
 */

const LEGACY_NODE_PREFIXES = [
  '/api/csrf-token',
  '/api/chat/',
  '/api/device/',
  '/api/admin/questions',
  '/api/admin/chat',
  '/api/admin/device',
]

/** 旧路径 → V2 路径的特殊映射（主 api 客户端） */
const EXACT_MAP = {
  '/api/admin/auth/login': '/api/v2/auth/admin/login',
  '/api/admin/auth/logout': '/api/v2/auth/admin/logout',
  '/api/admin/auth/me': '/api/v2/auth/admin/me',
}

function staysOnLegacyNode(url) {
  const path = String(url || '').split('?')[0]
  // 设备验签、固件、验证设置等均在 Node（/api/admin/device*，含 devices）
  if (path.startsWith('/api/admin/device')) {
    return true
  }
  // 客服设置、Telegram 配置等（/api/admin/chat* 含 chat-admins）
  if (path.startsWith('/api/admin/chat')) {
    return true
  }
  // 历史商品图只读
  if (/^\/api\/product-images\/\d+$/.test(path)) {
    return true
  }
  return LEGACY_NODE_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(prefix)
  )
}

/**
 * @param {string} url 原始请求路径（如 /api/orders）
 * @returns {string} 实际请求路径
 */
export function resolveApiPath(url) {
  const raw = String(url || '')
  if (!raw.startsWith('/api/')) {
    return raw
  }
  if (staysOnLegacyNode(raw)) {
    return raw
  }

  const [path, query] = raw.split('?')
  if (EXACT_MAP[path]) {
    return query ? `${EXACT_MAP[path]}?${query}` : EXACT_MAP[path]
  }

  const v2 = path.replace(/^\/api\//, '/api/v2/')
  return query ? `${v2}?${query}` : v2
}

export function useV2Api() {
  return import.meta.env.VITE_USE_V2_API !== 'false'
}
