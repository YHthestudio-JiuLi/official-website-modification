import axios from 'axios'

/**
 * 旧 Node API 客户端（不映射到 /api/v2）
 * 用于题库、设备验签、聊天等尚未迁入 Laravel 的接口
 */
const legacyNode = axios.create({
  baseURL: '',
  timeout: 7200000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

legacyNode.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

export default legacyNode
