import { fetchNodeAdminMe, loginNodeAdmin, logoutNodeAdmin, establishNodeAdminSession } from '@/services/legacyNodeAuth'
import v2 from '@/services/v2/http'
import { LEGACY_NODE_BRIDGE_TOKEN_KEY } from '@/constants/legacyNodeBridge'

const BRIDGE_TOKEN_KEY = LEGACY_NODE_BRIDGE_TOKEN_KEY
const SYNC_COOLDOWN_MS = 30000
let syncInFlight = null
let lastSyncFailAt = 0

/** 同步失败后短时间内不再重复请求，避免 Python 不可用时刷屏 */
function shouldSkipSyncAttempt() {
  return Date.now() - lastSyncFailAt < SYNC_COOLDOWN_MS
}

function markSyncFailed() {
  lastSyncFailAt = Date.now()
}

function markSyncSucceeded() {
  lastSyncFailAt = 0
}

/** 缓存登录/me 响应中的 bridge token，供 Node 会话建立重试 */
export function saveLegacyNodeBridgeToken(token) {
  if (token) {
    sessionStorage.setItem(BRIDGE_TOKEN_KEY, token)
  }
}

export function getLegacyNodeBridgeToken() {
  return sessionStorage.getItem(BRIDGE_TOKEN_KEY) || null
}

export function clearLegacyNodeBridgeToken() {
  sessionStorage.removeItem(BRIDGE_TOKEN_KEY)
}

/** 是否已有 Node 端 admin 会话（题库/固件/设备等） */
export async function hasLegacyNodeAdminSession() {
  try {
    const data = await fetchNodeAdminMe()
    return !!data?.admin
  } catch {
    return false
  }
}

/** 用 bridge token 在 Node 建立 admin 会话 */
export async function establishNodeAdminWithToken(token) {
  if (!token) {
    throw new Error('missing bridge token')
  }
  await establishNodeAdminSession(token)
}

/** 通过 Laravel 已登录会话换取 Node bridge token 并建立 Node 会话 */
export async function establishNodeAdminViaBridge() {
  const { data } = await v2.post('/auth/admin/legacy-node-bridge')
  if (data.token) {
    saveLegacyNodeBridgeToken(data.token)
  }
  await establishNodeAdminWithToken(data.token)
}

/**
 * 确保 Node legacy 会话存在
 * @param {string|null} bridgeToken 登录/me 响应中的 legacyNodeBridgeToken（优先，避免额外请求）
 */
export async function ensureLegacyNodeAdminSession(bridgeToken = null, { force = false } = {}) {
  if (await hasLegacyNodeAdminSession()) {
    markSyncSucceeded()
    return true
  }
  if (!force && shouldSkipSyncAttempt()) return false
  if (syncInFlight) return syncInFlight

  syncInFlight = (async () => {
    const token = bridgeToken || getLegacyNodeBridgeToken()
    if (token) {
      try {
        await establishNodeAdminWithToken(token)
        if (await hasLegacyNodeAdminSession()) {
          markSyncSucceeded()
          return true
        }
      } catch {
        // 继续尝试 bridge 接口
      }
    }

    try {
      await establishNodeAdminViaBridge()
      if (await hasLegacyNodeAdminSession()) {
        markSyncSucceeded()
        return true
      }
    } catch {
      markSyncFailed()
      return false
    }

    markSyncFailed()
    return false
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}

/**
 * 登录成功后同步 Node 会话
 * @param {object} credentials username/password
 * @param {string|null} bridgeToken 来自 Laravel 登录响应
 */
export async function syncLegacyNodeAdminSession(credentials, bridgeToken = null) {
  if (bridgeToken) {
    saveLegacyNodeBridgeToken(bridgeToken)
    try {
      await establishNodeAdminWithToken(bridgeToken)
      if (await hasLegacyNodeAdminSession()) return true
    } catch (error) {
      console.warn('[legacyNode] bridge token establish failed:', error?.response?.data || error.message)
    }
  }

  try {
    await loginNodeAdmin(credentials)
    if (await hasLegacyNodeAdminSession()) return true
  } catch (error) {
    console.warn('[legacyNode] node login failed:', error?.response?.data || error.message)
  }

  try {
    await establishNodeAdminViaBridge()
    return await hasLegacyNodeAdminSession()
  } catch (error) {
    console.warn('[legacyNode] sync failed:', error?.response?.data || error.message)
    return false
  }
}

/**
 * 后台会话失效时强制跳转登录页
 * @returns {Promise<boolean>} 是否已执行跳转
 */
export async function forceAdminReauth() {
  const { redirectToAdminLogin } = await import('@/utils/adminSessionRedirect')
  await redirectToAdminLogin()
  return true
}
