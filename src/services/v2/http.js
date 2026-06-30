import axios from 'axios'
import { currentAcceptLanguage } from '@/utils/authErrorMessage'
import { registerV2CsrfReset } from '@/services/csrfResetRegistry'
import { notifyAdminUnauthorized } from '@/services/sessionUnauthorizedRegistry'

/**
 * Laravel Sanctum API 客户端（/api/v2）
 * 写操作前自动拉取 CSRF Cookie
 */
const v2 = axios.create({
  baseURL: '/api/v2',
  timeout: 30000,
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

let csrfPending = null
let csrfRefreshing = false
const CSRF_MAX_RETRIES = 3
/** Sanctum CSRF 拉取超时，避免写请求在 ensureCsrf 中无限挂起 */
const CSRF_FETCH_TIMEOUT_MS = 15000

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

registerV2CsrfReset(() => {
  csrfPending = null
})

/** 从 document.cookie 读取明文 XSRF-TOKEN（与 Laravel EncryptCookies 例外一致） */
function readXsrfTokenFromCookie() {
  if (typeof document === 'undefined') return null
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('XSRF-TOKEN='))
  if (!entry) return null
  return decodeURIComponent(entry.slice('XSRF-TOKEN='.length))
}

function fetchCsrfCookie() {
  return axios.get('/sanctum/csrf-cookie', {
    withCredentials: true,
    timeout: CSRF_FETCH_TIMEOUT_MS,
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }).then((res) => {
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`CSRF cookie request failed (${res.status})`)
      err.response = res
      throw err
    }
    const token = readXsrfTokenFromCookie()
    if (!token) {
      throw new Error('XSRF-TOKEN cookie missing after /sanctum/csrf-cookie')
    }
    return token
  })
}

/** 每次写操作前拉取 CSRF；并发写请求共用同一次 in-flight 拉取 */
async function ensureCsrf() {
  if (csrfPending) {
    await csrfPending
    return readXsrfTokenFromCookie()
  }
  csrfPending = fetchCsrfCookie().finally(() => {
    csrfPending = null
  })
  return csrfPending
}

function isCsrfError(error) {
  const status = error.response?.status
  if (status !== 403 && status !== 419) return false
  const data = error.response?.data
  const text = String(
    (typeof data === 'object' && data ? (data.message || data.error) : data) || ''
  ).toLowerCase()
  return text.includes('csrf') || status === 419
}

function isMutatingMethod(method) {
  return MUTATING_METHODS.has(String(method || 'get').toLowerCase())
}

function attachXsrfHeader(config) {
  const token = readXsrfTokenFromCookie()
  if (token) {
    config.headers['X-XSRF-TOKEN'] = token
  }
  return config
}

v2.interceptors.request.use(async (config) => {
  if (isMutatingMethod(config.method)) {
    await ensureCsrf()
    attachXsrfHeader(config)
  }
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  config.headers['Accept-Language'] = currentAcceptLanguage()
  return config
})

v2.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401) {
      const base = String(originalRequest?.baseURL || '')
      const path = String(originalRequest?.url || '')
      notifyAdminUnauthorized(`${base}${path}`)
      return Promise.reject(error)
    }

    if (originalRequest && isCsrfError(error)) {
      const retryCount = originalRequest._csrfRetryCount || 0
      if (retryCount < CSRF_MAX_RETRIES) {
        originalRequest._csrfRetryCount = retryCount + 1
        if (csrfRefreshing && csrfPending) {
          await csrfPending.catch(() => {})
        } else {
          csrfRefreshing = true
          try {
            await refreshV2Csrf()
          } finally {
            csrfRefreshing = false
          }
        }
        attachXsrfHeader(originalRequest)
        return v2.request(originalRequest)
      }
    }

    return Promise.reject(error)
  }
)

export function resetV2Csrf() {
  csrfPending = null
}

/** 供 api.js 等复用：写操作前拉取 Sanctum CSRF */
export async function ensureV2Csrf() {
  return ensureCsrf()
}

/** 供 api.js 等复用：将 cookie 中的 token 写入请求头 */
export function attachV2CsrfHeader(config) {
  return attachXsrfHeader(config)
}

export function isV2CsrfError(error) {
  return isCsrfError(error)
}

/** 写操作前强制刷新 CSRF（多图上传、长表单保存前调用） */
export async function refreshV2Csrf() {
  if (csrfPending) {
    await csrfPending.catch(() => {})
  }
  csrfPending = fetchCsrfCookie().finally(() => {
    csrfPending = null
  })
  await csrfPending
}

export default v2
