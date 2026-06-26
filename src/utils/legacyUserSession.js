import { fetchNodeUserMe, establishNodeUserSession } from '@/services/legacyNodeAuth'
import v2 from '@/services/v2/http'

let syncInFlight = null

/** 是否已有 Node 端前台用户会话（在线客服） */
export async function hasLegacyNodeUserSession() {
  try {
    const data = await fetchNodeUserMe()
    return !!data?.user
  } catch (err) {
    // 410 表示 Node 未放行该路径，需重启 Node 服务加载最新 allowlist
    if (err.response?.status === 410) {
      console.error('[chat] Node /api/auth/me 返回 410，请重启 Node API 服务 (npm start)')
    }
    return false
  }
}

/** Laravel web 会话 → Node 用户会话 */
export async function ensureLegacyNodeUserSession() {
  if (await hasLegacyNodeUserSession()) {
    return true
  }
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = (async () => {
    try {
      const { data } = await v2.post('/auth/legacy-node-bridge')
      if (!data?.token) {
        return false
      }
      const established = await establishNodeUserSession(data.token)
      if (established?.user) {
        return true
      }
      return await hasLegacyNodeUserSession()
    } catch (err) {
      if (err.response?.status === 410) {
        console.error('[chat] Node /api/auth/establish 返回 410，请重启 Node API 服务 (npm start)')
      }
      return false
    }
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}
