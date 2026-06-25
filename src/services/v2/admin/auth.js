import v2 from '../http'

export function adminLogin(credentials) {
  return v2.post('/auth/admin/login', credentials)
}

export function logout() {
  return v2.post('/auth/admin/logout')
}

export function fetchMe() {
  // 会话检查须快速失败，避免路由守卫长时间白屏
  return v2.get('/auth/admin/me', { timeout: 10000 })
}

export function fetchMenus() {
  return v2.get('/admin/menus')
}
