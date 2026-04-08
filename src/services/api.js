import axios from 'axios'

const api = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true, // Important for session cookies
  headers: {
    'Content-Type': 'application/json'
  }
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

    // For POST, PUT, DELETE requests, ensure we have a CSRF token
    if (['post', 'put', 'delete'].includes(config.method?.toLowerCase())) {
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