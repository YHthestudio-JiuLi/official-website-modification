import { LEGACY_NODE_BRIDGE_TOKEN_KEY } from '@/constants/legacyNodeBridge'

/** 后台退出：清 bridge token 与 CSRF 缓存 */
export async function finalizeAdminLogout(adminStore, adminV2Store) {
  sessionStorage.removeItem(LEGACY_NODE_BRIDGE_TOKEN_KEY)
  await Promise.allSettled([adminStore.logout(), adminV2Store.logout()])
  const [{ resetApiCsrf }, { resetV2Csrf }] = await Promise.all([
    import('@/services/api'),
    import('@/services/v2/http')
  ])
  resetApiCsrf()
  resetV2Csrf()
}
