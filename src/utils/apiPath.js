/**
 * 将旧 /api/* 路径映射到 Laravel /api/v2/*（迁移期）
 *
 * 仍直连 Node 的前端路径（见 staysOnLegacyNode）：
 * - /api/chat/*、/ws：在线客服
 * - /api/device/*：设备公开验签
 * - /api/admin/questions/upload/*、/api/admin/device-firmwares/upload/*：大文件分片直连 Node
 * - /api/admin/auth/establish：Laravel bridge 建立 Node 会话
 *
 * init/complete 仍走 Laravel /api/v2；chunk 必须直连 Node（勿被 resolveApiPath 改写成 v2）
 */

const LEGACY_NODE_PREFIXES = [
  '/api/csrf-token',
  '/api/chat/',
  '/api/device/',
  '/api/admin/questions/upload',
  '/api/admin/device-firmwares/upload',
  '/api/admin/auth/establish',
]

/** 旧路径 → V2 路径的特殊映射（主 api 客户端） */
const EXACT_MAP = {
  '/api/admin/auth/login': '/api/v2/auth/admin/login',
  '/api/admin/auth/logout': '/api/v2/auth/admin/logout',
  '/api/admin/auth/me': '/api/v2/auth/admin/me',
}

/** 带数字 ID 的路径映射 */
const EXACT_ID_MAP = [
  [/^\/api\/product-images\/(\d+)$/, '/api/v2/product-images/$1'],
]

function staysOnLegacyNode(url) {
  const path = String(url || '').split('?')[0]
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

  const [path, query] = raw.split('?')

  // 后台认证始终走 Laravel（Node 侧默认 410）
  if (EXACT_MAP[path]) {
    return query ? `${EXACT_MAP[path]}?${query}` : EXACT_MAP[path]
  }

  if (staysOnLegacyNode(raw)) {
    return raw
  }

  if (!useV2Api()) {
    return raw
  }

  for (const [pattern, replacement] of EXACT_ID_MAP) {
    const match = path.match(pattern)
    if (match) {
      const mapped = replacement.replace('$1', match[1])
      return query ? `${mapped}?${query}` : mapped
    }
  }

  const v2 = path.replace(/^\/api\//, '/api/v2/')
  return query ? `${v2}?${query}` : v2
}

export function useV2Api() {
  return import.meta.env.VITE_USE_V2_API !== 'false'
}
