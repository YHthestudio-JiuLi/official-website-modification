import { fetchNodeUserMe, establishNodeUserSession } from '@/services/legacyNodeAuth'
import v2 from '@/services/v2/http'

let syncInFlight = null

/** 是否已有 Node 端前台用户会话（在线客服） */
export async function hasLegacyNodeUserSession() {
  try {
    const data = await fetchNodeUserMe()
    return !!data?.user
  } catch {
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
      await establishNodeUserSession(data.token)
      return await hasLegacyNodeUserSession()
    } catch {
      return false
    }
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}
