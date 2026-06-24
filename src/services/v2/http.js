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
const CSRF_MAX_RETRIES = 1

async function ensureCsrf() {
  if (csrfReady) return
  if (csrfPending) {
    await csrfPending
    return
  }
  csrfPending = axios.get('/sanctum/csrf-cookie', {
    withCredentials: true,
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }).then(() => {
    csrfReady = true
  }).finally(() => {
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

v2.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrf()
  }
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

v2.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401) {
      csrfReady = false
      const base = String(originalRequest?.baseURL || '')
      const path = String(originalRequest?.url || '')
      handleAdminSessionUnauthorized(`${base}${path}`)
      return Promise.reject(error)
    }

    if (originalRequest && isCsrfError(error) && !originalRequest._csrfRetry) {
      originalRequest._csrfRetry = true
      originalRequest._csrfRetryCount = (originalRequest._csrfRetryCount || 0) + 1
      if (originalRequest._csrfRetryCount <= CSRF_MAX_RETRIES) {
        csrfReady = false
        if (csrfRefreshing) {
          await csrfPending
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

export default v2
