/**
 * 校验登录回跳路径，避免开放重定向（仅允许站内 hash 或相对路径）
 */
export function isSafeInternalRedirect(path) {
  if (typeof path !== 'string' || !path.length || path === '/') return false
  if (path.startsWith('//')) return false
  if (path.startsWith('#/')) return true
  if (path.startsWith('/#')) return true
  // 部分环境下 fullPath 为 /products/1?checkout=1（仍属本站路由）
  if (path.startsWith('/') && !path.startsWith('//')) return true
  return false
}
