import v2 from '../http'

export function fetchUsers(config = {}) {
  return v2.get('/admin/users', config)
}

export function fetchUser(id) {
  return v2.get(`/admin/users/${id}`)
}

export function createUser(payload) {
  return v2.post('/admin/users', payload)
}

export function updateUser(id, payload) {
  return v2.put(`/admin/users/${id}`, payload)
}

export function deleteUser(id) {
  return v2.delete(`/admin/users/${id}`)
}
