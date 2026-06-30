import { LEGACY_NODE_BRIDGE_TOKEN_KEY } from '@/constants/legacyNodeBridge'
import { resetAllCsrfState } from '@/services/csrfResetRegistry'

/** 后台退出：清 bridge token 与 CSRF 缓存 */
export async function finalizeAdminLogout(adminStore, adminV2Store) {
  sessionStorage.removeItem(LEGACY_NODE_BRIDGE_TOKEN_KEY)
  await Promise.allSettled([adminStore.logout(), adminV2Store.logout()])
  resetAllCsrfState()
}
