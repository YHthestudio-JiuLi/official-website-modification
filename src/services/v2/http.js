import axios from 'axios'
import { handleAdminSessionUnauthorized } from '@/utils/adminSessionRedirect'

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

let csrfReady = false
let csrfPending = null
let csrfRefreshing = false
const CSRF_MAX_RETRIES = 2
/** Sanctum CSRF 拉取超时，避免写请求在 ensureCsrf 中无限挂起 */
const CSRF_FETCH_TIMEOUT_MS = 15000

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

function fetchCsrfCookie() {
  return axios.get('/sanctum/csrf-cookie', {
    withCredentials: true,
    timeout: CSRF_FETCH_TIMEOUT_MS,
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }).then((res) => {
    if (res.status >= 200 && res.status < 300) {
      csrfReady = true
      return
    }
    const err = new Error(`CSRF cookie request failed (${res.status})`)
    err.response = res
    throw err
  })
}

async function ensureCsrf() {
  if (csrfReady) return
  if (csrfPending) {
    await csrfPending
    return
  }
  csrfPending = fetchCsrfCookie().finally(() => {
    csrfPending = null
  })
  await csrfPending
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

v2.interceptors.request.use(async (config) => {
  if (isMutatingMethod(config.method)) {
    await ensureCsrf()
  }
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

v2.interceptors.response.use(
  (response) => {
    // Laravel 每次写操作会轮换 CSRF，下次写操作前需重新拉取 cookie
    if (isMutatingMethod(response.config?.method)) {
      csrfReady = false
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401) {
      csrfReady = false
      const base = String(originalRequest?.baseURL || '')
      const path = String(originalRequest?.url || '')
      handleAdminSessionUnauthorized(`${base}${path}`)
      return Promise.reject(error)
    }

    if (originalRequest && isCsrfError(error)) {
      const retryCount = originalRequest._csrfRetryCount || 0
      if (retryCount < CSRF_MAX_RETRIES) {
        originalRequest._csrfRetryCount = retryCount + 1
        csrfReady = false
        if (csrfRefreshing && csrfPending) {
          await csrfPending.catch(() => {})
        } else {
          csrfRefreshing = true
          try {
            await ensureCsrf()
          } finally {
            csrfRefreshing = false
          }
        }
        return v2.request(originalRequest)
      }
    }

    return Promise.reject(error)
  }
)

export function resetV2Csrf() {
  csrfReady = false
}

/** 写操作前强制刷新 CSRF（多图上传、长表单保存前调用） */
export async function refreshV2Csrf() {
  csrfReady = false
  if (csrfPending) {
    await csrfPending.catch(() => {})
  }
  await ensureCsrf()
}

export default v2
