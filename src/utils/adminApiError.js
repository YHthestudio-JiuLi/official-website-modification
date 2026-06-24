/**
 * 从 axios 错误中提取后台 API 可读信息
 */
export function readAdminApiError(error, fallback = '请求失败') {
  const data = error?.response?.data
  if (!data) return error?.message || fallback
  if (typeof data === 'string') return data
  return data.error || data.message || data.detail || fallback
}

import { redirectToAdminLogin, isAdminSessionRedirectActive } from '@/utils/adminSessionRedirect'

/**
 * 401/403 时尝试跳转登录
 */
export async function handleAdminApiFailure(error, { onForbidden } = {}) {
  const status = error?.response?.status
  if (status === 401) {
    if (!isAdminSessionRedirectActive()) {
      await redirectToAdminLogin()
    }
    return true
  }
  if (status === 403) {
    onForbidden?.(readAdminApiError(error, '无权限访问'))
    return true
  }
  return false
}
