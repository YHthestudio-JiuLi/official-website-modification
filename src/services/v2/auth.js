import v2 from './http'

/** 前台用户认证 */
export function login(credentials) {
  return v2.post('/auth/login', credentials)
}

export function register(payload) {
  return v2.post('/auth/register', payload)
}

export function logout() {
  return v2.post('/auth/logout')
}

export function fetchMe() {
  return v2.get('/auth/me')
}
