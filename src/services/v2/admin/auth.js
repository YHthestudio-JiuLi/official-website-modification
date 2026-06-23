import v2 from '../http'

export function adminLogin(credentials) {
  return v2.post('/auth/admin/login', credentials)
}

export function logout() {
  return v2.post('/auth/admin/logout')
}

export function fetchMe() {
  return v2.get('/auth/admin/me')
}

export function fetchMenus() {
  return v2.get('/admin/menus')
}
