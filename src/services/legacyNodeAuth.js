import axios from 'axios'
import { readLegacyNodeBridgeToken } from '@/constants/legacyNodeBridge'

function attachLegacyNodeToken(config) {
  const url = String(config.url || '')
  if (url.includes('/api/admin')) {
    const token = readLegacyNodeBridgeToken()
    if (token) {
      config.headers['X-Legacy-Node-Token'] = token
    }
  }
  return config
}

/** 认证相关请求使用较短超时，避免登录被 legacy 同步长时间阻塞 */
const legacyNodeAuthClient = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

legacyNodeAuthClient.interceptors.request.use((config) => attachLegacyNodeToken(config))

/** 在 Laravel 登录成功后，同步建立 Node 端 admin 会话（题库/设备等依赖） */
export async function loginNodeAdmin(credentials) {
  const { data } = await legacyNodeAuthClient.post('/api/admin/auth/login', credentials)
  return data
}

export async function logoutNodeAdmin() {
  try {
    await legacyNodeAuthClient.post('/api/admin/auth/logout')
  } catch {
    // 忽略：可能本无 Node 会话
  }
}

export async function fetchNodeAdminMe() {
  const { data } = await legacyNodeAuthClient.get('/api/admin/auth/me')
  return data
}

/** 用 bridge token 建立 Node 会话（独立于 legacyNode 长超时客户端） */
export async function establishNodeAdminSession(token) {
  const { data } = await legacyNodeAuthClient.post('/api/admin/auth/establish', { token })
  return data
}

export async function fetchNodeUserMe() {
  const { data } = await legacyNodeAuthClient.get('/api/auth/me')
  return data
}

/** 用 bridge token 建立 Node 前台用户会话 */
export async function establishNodeUserSession(token) {
  const { data } = await legacyNodeAuthClient.post('/api/auth/establish', { token })
  return data
}
