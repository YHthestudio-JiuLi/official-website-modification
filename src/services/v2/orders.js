import v2 from './http'

export function fetchOrders(config = {}) {
  return v2.get('/orders', config)
}

export function fetchOrder(id) {
  return v2.get(`/orders/${id}`)
}

export function createOrder(payload) {
  return v2.post('/orders', payload)
}

export function confirmOrder(id, payload) {
  return v2.post(`/orders/${id}/confirm`, payload)
}

export function fetchOrderTracking(id) {
  return v2.get(`/orders/${id}/tracking`)
}

export function fetchCheckoutPreview(params) {
  return v2.get('/checkout/preview', { params })
}
