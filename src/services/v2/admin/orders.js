import v2 from '../http'

export function fetchOrders(params = {}) {
  return v2.get('/admin/orders', { params })
}

export function updateOrderStatus(id, payload) {
  return v2.put(`/admin/orders/${id}/status`, payload)
}

export function updateOrderTracking(id, payload) {
  return v2.put(`/admin/orders/${id}/tracking`, payload)
}

export function deleteOrder(id) {
  return v2.delete(`/admin/orders/${id}`)
}
