import axios from 'axios'
import { resolveApiPath, useV2Api } from '@/utils/apiPath'
import { readLegacyNodeBridgeToken } from '@/constants/legacyNodeBridge'
import { handleAdminSessionUnauthorized } from '@/utils/adminSessionRedirect'

const USE_V2 = useV2Api()

const api = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

// 旧 Node CSRF
let csrfToken = null
let isRefreshingToken = false
let failedQueue = []
const MAX_RETRIES = 1

// Laravel Sanctum CSRF
let sanctumReady = false
let sanctumPending = null

async function ensureSanctumCsrf() {
  if (sanctumReady) return
  if (sanctumPending) {
    await sanctumPending
    return
  }
  sanctumPending = axios.get('/sanctum/csrf-cookie', {
    withCredentials: true,
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }).then(() => {
    sanctumReady = true
  }).finally(() => {
    sanctumPending = null
  })
  await sanctumPending
}

function isV2Request(url) {
  const resolved = resolveApiPath(url)
  return resolved.startsWith('/api/v2/')
}

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

api.interceptors.request.use(
  async (config) => {
    if (config.url) {
      config.url = resolveApiPath(config.url)
    }

    if (config.url === '/api/csrf-token') {
      return config
    }

    if (config.data instanceof FormData) {
      if (!Number.isFinite(config.timeout) || config.timeout < 600000) {
        config.timeout = 7200000
      }
    } else if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }

    const reqUrl = String(config.url || '')
    if (reqUrl.includes('/api/admin') || reqUrl.includes('/api/v2/admin')) {
      const bridgeToken = readLegacyNodeBridgeToken()
      if (bridgeToken) {
        config.headers['X-Legacy-Node-Token'] = bridgeToken
      }
    }

    const method = (config.method || 'get').toLowerCase()
    if (!['post', 'put', 'delete', 'patch'].includes(method)) {
      return config
    }

    if (isV2Request(config.url)) {
      await ensureSanctumCsrf()
      return config
    }

    const isAdminApiWrite =
      ['post', 'put', 'delete', 'patch'].includes(method) && reqUrl.startsWith('/api/admin')

    if (!isAdminApiWrite) {
      if (!csrfToken && !isRefreshingToken) {
        isRefreshingToken = true
        try {
          const response = await axios.get('/api/csrf-token', { withCredentials: true })
          csrfToken = response.data.csrfToken
        } catch (error) {
          console.error('Failed to get CSRF token:', error)
        } finally {
          isRefreshingToken = false
        }
      }
      if (csrfToken) {
        config.headers['x-csrf-token'] = csrfToken
      }
    }

    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => {
    const newToken = response.headers['x-csrf-token']
    if (newToken && newToken !== csrfToken) {
      csrfToken = newToken
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401) {
      sanctumReady = false
      if (originalRequest?.url) {
        handleAdminSessionUnauthorized(originalRequest.url)
      }
    }

    if (!originalRequest || isV2Request(originalRequest.url)) {
      return Promise.reject(error)
    }

    const errorCode = error.response?.data?.code
    const errorText = String(
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      ''
    ).toLowerCase()

    if (error.response?.status === 403 &&
        (errorCode === 'INVALID_CSRF_TOKEN' || errorText.includes('csrf')) &&
        !originalRequest._retry) {
      if (isRefreshingToken) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers['x-csrf-token'] = token
            return api.request(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1

      if (originalRequest._retryCount > MAX_RETRIES) {
        console.error('Max CSRF token retry attempts reached')
        return Promise.reject(error)
      }

      isRefreshingToken = true
      try {
        const response = await axios.get('/api/csrf-token', { withCredentials: true })
        csrfToken = response.data.csrfToken
        processQueue(null, csrfToken)
        originalRequest.headers['x-csrf-token'] = csrfToken
        return api.request(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        console.error('Failed to refresh CSRF token:', refreshError)
        return Promise.reject(error)
      } finally {
        isRefreshingToken = false
      }
    }

    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export function resetApiCsrf() {
  csrfToken = null
  sanctumReady = false
}

export default api
