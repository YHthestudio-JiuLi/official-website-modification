import axios from 'axios'

/**
 * Laravel Sanctum API 客户端（/api/v2）
 * 写操作前自动拉取 CSRF Cookie
 */
const v2 = axios.create({
  baseURL: '/api/v2',
  timeout: 30000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

let csrfReady = false
let csrfPending = null

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
  (error) => {
    if (error.response?.status === 401) {
      csrfReady = false
    }
    return Promise.reject(error)
  }
)

export function resetV2Csrf() {
  csrfReady = false
}

export default v2
