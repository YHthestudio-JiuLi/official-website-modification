import v2 from '../http'

export function fetchPaymentSettings() {
  return v2.get('/admin/payment-settings')
}

export function updatePaymentSettings(payload) {
  return v2.put('/admin/payment-settings', payload)
}
