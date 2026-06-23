import legacyNode from '@/services/legacyNode'

/** 在 Laravel 登录成功后，同步建立 Node 端 admin 会话（题库/设备等依赖） */
export async function loginNodeAdmin(credentials) {
  const { data } = await legacyNode.post('/api/admin/auth/login', credentials)
  return data
}

export async function logoutNodeAdmin() {
  try {
    await legacyNode.post('/api/admin/auth/logout')
  } catch {
    // 忽略：可能本无 Node 会话
  }
}

export async function fetchNodeAdminMe() {
  const { data } = await legacyNode.get('/api/admin/auth/me')
  return data
}
