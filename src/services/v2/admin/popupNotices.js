import v2 from '../http'

export function fetchNotices() {
  return v2.get('/admin/popup-notices')
}

export function createNotice(payload) {
  return v2.post('/admin/popup-notices', payload)
}

export function updateNotice(id, payload) {
  return v2.put(`/admin/popup-notices/${id}`, payload)
}

export function deleteNotice(id) {
  return v2.delete(`/admin/popup-notices/${id}`)
}
