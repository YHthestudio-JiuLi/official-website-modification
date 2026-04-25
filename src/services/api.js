  import axios from 'axios'

  const api = axios.create({
    baseURL: '',
    timeout: 15000,
    withCredentials: true
  })

  // CSRF token storage
  let csrfToken = null
  let isRefreshingToken = false
  let failedQueue = []
  const MAX_RETRIES = 1

  // Process failed requests queue
  const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error)
      } else {
        prom.resolve(token)
      }
    })
    failedQueue = []
  }

  // Request interceptor
  api.interceptors.request.use(
    async (config) => {
      // Skip CSRF token for CSRF token endpoint itself to avoid infinite loop
      if (config.url === '/api/csrf-token') {
        return config
      }

      // For FormData, let axios handle Content-Type automatically (don't set it)
      if (config.data instanceof FormData) {
        // 大文件上传：默认 15s、页面误写的 60s 等都会失败，凡不足 10 分钟的一律提到 2 小时
        if (!Number.isFinite(config.timeout) || config.timeout < 600000) {
          config.timeout = 7200000
        }
      } else {
        // Set Content-Type for non-FormData requests
        config.headers['Content-Type'] = 'application/json'
      }

      // 管理端 /api/admin 在服务端已豁免 CSRF，不必先拉 token，也避免大文件上传前多一次请求失败
      const method = (config.method || 'get').toLowerCase()
      const reqUrl = String(config.url || '')
      const isAdminApiWrite =
        ['post', 'put', 'delete', 'patch'].includes(method) && reqUrl.startsWith('/api/admin')
      // For POST, PUT, DELETE requests, ensure we have a CSRF token（非管理端）
      if (['post', 'put', 'delete', 'patch'].includes(method) && !isAdminApiWrite) {
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

  // Response interceptor
  api.interceptors.response.use(
    (response) => {
      // If we get a new CSRF token in response headers, store it (token rotation)
      const newToken = response.headers['x-csrf-token']
      if (newToken && newToken !== csrfToken) {
        csrfToken = newToken
      }
      return response
    },
    async (error) => {
      const originalRequest = error.config
      const errorCode = error.response?.data?.code
      const errorText = String(
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        ''
      ).toLowerCase()

      // If we get a CSRF token error, try to get a new token and retry
      if (error.response?.status === 403 &&
          (errorCode === 'INVALID_CSRF_TOKEN' || errorText.includes('csrf')) &&
          !originalRequest._retry) {
        
        if (isRefreshingToken) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then(token => {
              originalRequest.headers['x-csrf-token'] = token
              return api.request(originalRequest)
            })
            .catch(err => Promise.reject(err))
        }

        originalRequest._retry = true
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1

        // Check retry count to prevent infinite loop
        if (originalRequest._retryCount > MAX_RETRIES) {
          console.error('Max CSRF token retry attempts reached')
          return Promise.reject(error)
        }

        isRefreshingToken = true
        try {
          const response = await axios.get('/api/csrf-token', { withCredentials: true })
          csrfToken = response.data.csrfToken
          processQueue(null, csrfToken)
          
          // Retry the original request with the new token
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

  export default api