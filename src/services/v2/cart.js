import v2 from './http'

export function fetchCart() {
  return v2.get('/cart')
}

export function addItem(payload) {
  return v2.post('/cart/items', payload)
}

export function updateItem(productId, payload) {
  return v2.put(`/cart/items/${productId}`, payload)
}

export function removeItem(productId) {
  return v2.delete(`/cart/items/${productId}`)
}

export function clearCart() {
  return v2.delete('/cart')
}
