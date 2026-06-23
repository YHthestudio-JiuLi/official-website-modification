import { fetchNodeAdminMe, loginNodeAdmin, logoutNodeAdmin } from '@/services/legacyNodeAuth'
import { resetApiCsrf } from '@/services/api'
import { resetV2Csrf } from '@/services/v2/http'

/** 是否已有 Node 端 admin 会话（题库/设备等） */
export async function hasLegacyNodeAdminSession() {
  try {
    const data = await fetchNodeAdminMe()
    return !!data?.admin
  } catch {
    return false
  }
}

/** 登录成功后同步 Node 会话 */
export async function syncLegacyNodeAdminSession(credentials) {
  try {
    await loginNodeAdmin(credentials)
  } catch (error) {
    console.warn('[legacyNode] sync login failed:', error?.response?.data || error.message)
  }
}

/** 退出全部会话并跳转登录（避免「登录页 → 又被踢回仪表盘」） */
export async function forceAdminReauth(router, adminStore, adminV2Store) {
  await logoutNodeAdmin()
  await Promise.allSettled([adminStore.logout(), adminV2Store.logout()])
  resetApiCsrf()
  resetV2Csrf()
  await router.push({ name: 'admin-login', query: { reauth: '1' } })
}
