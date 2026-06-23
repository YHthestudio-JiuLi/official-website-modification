import v2 from '../http'

export function fetchRoles() {
  return v2.get('/admin/roles')
}

export function createRole(payload) {
  return v2.post('/admin/roles', payload)
}

export function updateRole(id, payload) {
  return v2.put(`/admin/roles/${id}`, payload)
}

export function deleteRole(id) {
  return v2.delete(`/admin/roles/${id}`)
}

export function fetchPermissions() {
  return v2.get('/admin/permissions')
}
